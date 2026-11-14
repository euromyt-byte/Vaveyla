import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync, backup } from "node:sqlite";
import {
  jsonFile,
  GameError,
  need,
  integer,
  epoch,
  hash,
  nonce,
  casefold,
  MAX,
} from "./util.js";
const schema = jsonFile("sqlite-schema.json"),
  icons = {
    1: "warrior",
    2: "archer",
    3: "mage",
    4: "warrior",
    5: "archer",
    6: "mage",
  };
export class Store {
  constructor(filename, { clock = epoch, sessionTTL = 86400 } = {}) {
    this.path = path.resolve(filename);
    this.clock = clock;
    this.sessionTTL = integer(sessionTTL, 1, 2147483647);
    this.depth = 0;
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    this.existed = fs.existsSync(this.path);
    this.db = new DatabaseSync(this.path);
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
  }
  statement(sql) {
    const q = this.db.prepare(sql);
    q.setReadBigInts(true);
    return q;
  }
  row(r) {
    return r
      ? Object.fromEntries(
          Object.entries(r).map(([k, v]) => [
            k,
            typeof v === "bigint" &&
            v >= BigInt(Number.MIN_SAFE_INTEGER) &&
            v <= BigInt(Number.MAX_SAFE_INTEGER)
              ? Number(v)
              : v,
          ]),
        )
      : r;
  }
  all(sql, ...args) {
    return this.statement(sql)
      .all(...args)
      .map((r) => this.row(r));
  }
  get(sql, ...args) {
    return this.row(this.statement(sql).get(...args));
  }
  run(sql, ...args) {
    return this.db.prepare(sql).run(...args);
  }
  tx(fn) {
    const save = "vaveyla_" + this.depth,
      outer = this.depth === 0;
    this.db.exec(outer ? "BEGIN IMMEDIATE" : "SAVEPOINT " + save);
    this.depth++;
    try {
      const value = fn();
      need(!value?.then, "async_transaction");
      this.db.exec(outer ? "COMMIT" : "RELEASE " + save);
      return value;
    } catch (e) {
      this.db.exec(
        outer ? "ROLLBACK" : "ROLLBACK TO " + save + "; RELEASE " + save,
      );
      throw e;
    } finally {
      this.depth--;
    }
  }
  async initialize({ backupExisting = true } = {}) {
    const tables = new Set(
      this.all(
        "select name from sqlite_master where type='table' and name not like 'sqlite_%'",
      ).map((r) => r.name),
    );
    const version = this.get("PRAGMA user_version").user_version;
    if (tables.size) {
      need(
        version === 1 &&
          Object.keys(schema.core_columns).every((n) => tables.has(n)),
        "schema_mismatch",
        "Mevcut veritabanı şeması desteklenmiyor; kayıt korundu.",
      );
      for (const [n, cols] of Object.entries(schema.all_columns)) {
        if (tables.has(n)) {
          const present = new Set(
            this.all('PRAGMA table_info("' + n + '")').map((x) => x.name),
          );
          need(
            cols.every((c) => present.has(c)),
            "schema_mismatch",
            "SQLite tablo alanları desteklenmiyor: " + n,
          );
        }
      }
      if (backupExisting)
        this.backupPath = await this.makeBackup(
          path.join(
            path.dirname(this.path),
            "backups",
            path.basename(this.path) +
              ".node-" +
              Date.now() +
              "-" +
              nonce(4) +
              ".bak",
          ),
        );
    } else {
      need(version === 0, "schema_mismatch");
      this.db.exec(schema.core_sql);
    }
    this.tx(() => {
      for (const sql of schema.additional_sql) this.db.exec(sql);
      const old = this.get(
        "select sql from sqlite_master where type='table' and name='game_resources'",
      ).sql;
      if (!old.includes("'bound_diamonds'")) {
        const create = schema.additional_sql
          .find((sql) =>
            sql.startsWith("CREATE TABLE IF NOT EXISTS game_resources "),
          )
          .replace("IF NOT EXISTS game_resources", "game_resources_upgrade");
        this.db.exec(create);
        this.db.exec(
          "INSERT INTO game_resources_upgrade SELECT character_id,currency,amount FROM game_resources; DROP TABLE game_resources; ALTER TABLE game_resources_upgrade RENAME TO game_resources",
        );
      }
    });
    this.tx(() => {
      if (
        !this.get(
          "select 1 from game_migrations where name=?",
          "guild-wallet-1.1.0",
        )
      ) {
        for (const row of this.all(
          "select character_id,contribution from game_guild_members where contribution>0",
        )) {
          const before =
            this.get(
              "select amount from game_resources where character_id=? and currency='guild_offer'",
              row.character_id,
            )?.amount ?? 0;
          need(
            before + row.contribution <= MAX,
            "currency_limit",
            "Lonca katkısı aktarımı bakiye sınırını aşıyor.",
          );
          this.run(
            "insert into game_resources values(?,'guild_offer',?) on conflict(character_id,currency) do update set amount=excluded.amount",
            row.character_id,
            before + row.contribution,
          );
          this.run(
            "insert into game_resource_ledger(character_id,currency,delta,before_amount,after_amount,reason,created_at) values(?,'guild_offer',?,?,?,'migration_guild_contribution',?)",
            row.character_id,
            row.contribution,
            before,
            before + row.contribution,
            this.clock(),
          );
        }
        this.run(
          "insert into game_migrations values(?,?)",
          "guild-wallet-1.1.0",
          this.clock(),
        );
      }
    });
    this.db.exec("PRAGMA journal_mode=WAL");
    fs.chmodSync(this.path, 0o600);
    return this;
  }
  async makeBackup(dest) {
    dest = path.resolve(dest);
    need(dest !== this.path, "invalid_backup_path");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    let fd;
    try {
      fd = fs.openSync(dest, "wx", 0o600);
    } catch {
      throw new GameError("backup_exists", "Yedek dosyası zaten var.");
    }
    fs.closeSync(fd);
    try {
      await backup(this.db, dest);
      const check = new DatabaseSync(dest, { readOnly: true });
      try {
        need(
          check.prepare("PRAGMA integrity_check").get().integrity_check ===
            "ok",
          "backup_failed",
        );
      } finally {
        check.close();
      }
      return dest;
    } catch (e) {
      fs.unlinkSync(dest);
      throw e;
    }
  }
  register(username, password) {
    need(
      typeof username === "string" && /^[A-Za-z0-9_]{3,32}$/.test(username),
      "invalid_username",
      "Kullanıcı adı 3–32 ASCII harf, rakam veya _ içermeli.",
      400,
    );
    this.checkPassword(password);
    const salt = crypto.randomBytes(16),
      digest = crypto.pbkdf2Sync(password, salt, 600000, 32, "sha256");
    try {
      const r = this.run(
        "insert into accounts(username,password_hash,created_at) values(?,?,?)",
        username,
        `pbkdf2_sha256$600000$${salt.toString("hex")}$${digest.toString("hex")}`,
        this.clock(),
      );
      return { id: Number(r.lastInsertRowid), username };
    } catch (e) {
      if (e.code === "ERR_SQLITE_ERROR" && e.errcode === 2067)
        throw new GameError("username_taken", "Bu kullanıcı adı kullanılıyor.");
      throw e;
    }
  }
  checkPassword(p) {
    need(
      typeof p === "string" &&
        Array.from(p).length >= 10 &&
        Array.from(p).length <= 128 &&
        !/[\ud800-\udfff]/u.test(
          p.replace(/[\ud800-\udbff][\udc00-\udfff]/g, ""),
        ),
      "invalid_password",
      "Parola 10–128 karakter olmalı.",
      400,
    );
  }
  login(username, password) {
    need(
      typeof username === "string" && /^[A-Za-z0-9_]{3,32}$/.test(username),
      "invalid_credentials",
      "Kullanıcı adı veya parola hatalı.",
      401,
    );
    try {
      this.checkPassword(password);
    } catch {
      throw new GameError(
        "invalid_credentials",
        "Kullanıcı adı veya parola hatalı.",
        401,
      );
    }
    const row = this.get(
      "select id,username,password_hash from accounts where username=? collate nocase",
      username,
    );
    let ok = false;
    try {
      const [algo, iter, salt, expected] = (
        row?.password_hash ??
        "pbkdf2_sha256$600000$" + "00".repeat(16) + "$" + "00".repeat(32)
      ).split("$");
      if (
        algo === "pbkdf2_sha256" &&
        iter === "600000" &&
        /^[0-9a-f]{32}$/.test(salt) &&
        /^[0-9a-f]{64}$/.test(expected)
      )
        ok = crypto.timingSafeEqual(
          crypto.pbkdf2Sync(
            password,
            Buffer.from(salt, "hex"),
            600000,
            32,
            "sha256",
          ),
          Buffer.from(expected, "hex"),
        );
    } catch {}
    need(
      row && ok,
      "invalid_credentials",
      "Kullanıcı adı veya parola hatalı.",
      401,
    );
    const token = crypto.randomBytes(32).toString("base64url"),
      expires_at = this.clock() + this.sessionTTL;
    this.tx(() => {
      this.run("delete from sessions where expires_at<=?", this.clock());
      this.run(
        "insert into sessions values(?,?,?)",
        hash(token),
        row.id,
        expires_at,
      );
    });
    return {
      token,
      expires_at,
      account: { id: row.id, username: row.username },
    };
  }
  authenticate(token) {
    need(
      typeof token === "string" &&
        token.length >= 1 &&
        token.length <= 256 &&
        /^[\x00-\x7f]+$/.test(token),
      "invalid_session",
      "Geçerli oturum gerekli.",
      401,
    );
    const a = this.get(
      "select a.id,a.username from sessions s join accounts a on a.id=s.account_id where token_hash=? and expires_at>?",
      hash(token),
      this.clock(),
    );
    need(a, "invalid_session", "Oturum geçersiz veya süresi dolmuş.", 401);
    return a;
  }
  gateway(id, sessionHash) {
    integer(id, 1);
    need(
      typeof sessionHash === "string" && /^[a-f0-9]{64}$/.test(sessionHash),
      "invalid_ticket",
      "Giriş bileti geçersiz.",
      401,
    );
    const a = this.get(
      "select a.id,a.username from sessions s join accounts a on a.id=s.account_id where s.account_id=? and s.token_hash=? and s.expires_at>?",
      id,
      sessionHash,
      this.clock(),
    );
    need(a, "invalid_ticket", "Giriş bileti geçersiz.", 401);
    return a;
  }
  role(accountId) {
    integer(accountId, 1);
    const r = this.get(
      "select c.*,r.sex,r.icon,r.camp,r.site from characters c left join wartune_roles r on r.character_id=c.id where c.account_id=?",
      accountId,
    );
    if (!r) return null;
    if (r.icon == null)
      Object.assign(r, {
        sex: 1,
        icon: { warrior: 1, archer: 2, mage: 3 }[r.archetype],
        camp: 1,
        site: "1",
      });
    r.player_id = accountId;
    return r;
  }
  character(accountId) {
    return (
      this.get(
        "select id,account_id,name,archetype,level,gold,diamonds from characters where account_id=?",
        integer(accountId, 1),
      ) ?? null
    );
  }
  createRole(id, name, sex, icon, camp = 1, site = "local") {
    return this.tx(() => {
      integer(id, 1);
      need(
        [0, 1].includes(sex) &&
          Number.isInteger(icon) &&
          icons[icon] &&
          camp === 1 &&
          (sex === 1) === icon <= 3,
        "invalid_role",
      );
      need(
        typeof site === "string" &&
          site.trim() &&
          site.length <= 64 &&
          !/[\x00-\x1f\x7f]/.test(site),
        "invalid_site",
      );
      need(typeof name === "string", "invalid_name");
      name = name.normalize("NFC").trim();
      need(
        Array.from(name).length >= 3 &&
          Array.from(name).length <= 20 &&
          /^[\p{L}\p{N} _-]+$/u.test(name) &&
          /[\p{L}\p{N}]/u.test(name),
        "invalid_name",
        "Karakter adı 3–20 harf/rakam olmalı.",
        400,
      );
      need(
        this.get("select 1 from accounts where id=?", id),
        "account_not_found",
      );
      need(!this.role(id), "character_exists");
      try {
        this.run(
          "insert into characters(account_id,name,name_key,archetype,created_at) values(?,?,?,?,?)",
          id,
          name,
          casefold(name),
          icons[icon],
          this.clock(),
        );
      } catch (e) {
        if (e.code === "ERR_SQLITE_ERROR" && e.errcode === 2067)
          throw new GameError("name_taken", "Bu karakter adı kullanılıyor.");
        throw e;
      }
      const r = this.character(id);
      this.run(
        "insert into wartune_roles values(?,?,?,?,?)",
        r.id,
        sex,
        icon,
        camp,
        site,
      );
      return this.role(id);
    });
  }
  issueTicket(id, key, token, site, ttl = 60) {
    return this.tx(() => {
      integer(id, 1);
      need(
        typeof key === "string" && /^[a-f0-9]{32}$/i.test(key),
        "invalid_ticket",
        "Geçersiz bilet.",
        401,
      );
      const a = this.authenticate(token);
      need(a.id === id, "invalid_ticket");
      const s = this.get(
        "select expires_at from sessions where token_hash=?",
        hash(token),
      );
      need(
        site &&
          typeof site === "string" &&
          site.length <= 64 &&
          !/[\x00-\x1f\x7f]/.test(site),
        "invalid_site",
      );
      integer(ttl, 1, 86400);
      this.run(
        "insert into wartune_tickets values(?,?,?,?,?) on conflict(account_id) do update set md5_key_hash=excluded.md5_key_hash,session_token_hash=excluded.session_token_hash,site=excluded.site,expires_at=excluded.expires_at",
        id,
        hash(key.toLowerCase()),
        hash(token),
        site,
        Math.min(this.clock() + ttl, s.expires_at),
      );
    });
  }
  createRoleTicket(id, name, sex, icon, camp, site, key, token) {
    return this.tx(() => {
      const r = this.createRole(id, name, sex, icon, camp, site);
      this.issueTicket(id, key, token, site);
      return r;
    });
  }
  consumeTicket(id, key) {
    return this.tx(() => {
      integer(id, 1);
      need(
        typeof key === "string" && /^[0-9a-f]{32}$/i.test(key),
        "invalid_ticket",
        "Giriş bileti geçersiz.",
        401,
      );
      const r = this.get(
        "select a.id,a.username,t.site,t.session_token_hash from wartune_tickets t join accounts a on a.id=t.account_id join sessions s on s.token_hash=t.session_token_hash and s.account_id=t.account_id where t.account_id=? and t.md5_key_hash=? and t.expires_at>? and s.expires_at>?",
        id,
        hash(key.toLowerCase()),
        this.clock(),
        this.clock(),
      );
      need(
        r,
        "invalid_ticket",
        "Giriş bileti geçersiz veya süresi dolmuş.",
        401,
      );
      this.run("delete from wartune_tickets where account_id=?", id);
      return {
        account: { id: r.id, username: r.username },
        site: r.site,
        session_token_hash: r.session_token_hash,
      };
    });
  }
  setDiamonds(id, amount, reason) {
    integer(id, 1);
    integer(amount);
    need(
      typeof reason === "string" && reason.trim() && reason.length <= 200,
      "invalid_reason",
    );
    return this.tx(() => {
      const r = this.get("select * from characters where id=?", id);
      need(r, "character_not_found");
      this.run("update characters set diamonds=? where id=?", amount, id);
      this.run(
        "insert into diamond_ledger(character_id,before_amount,after_amount,reason,created_at) values(?,?,?,?,?)",
        id,
        r.diamonds,
        amount,
        reason.trim(),
        this.clock(),
      );
      return { ...r, diamonds: amount };
    });
  }
  close() {
    this.db.close();
  }
}
