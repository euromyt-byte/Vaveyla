import os from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { zipSync, strToU8 } from "fflate";
import { Assets, resolve, safeName, manifest } from "../src/assets.js";
import { jsonFile, hash } from "../src/util.js";
function fixture(t) {
  const root = fs.mkdtempSync(os.tmpdir() + "/vaveyla-node-assets-");
  t.after(() => fs.rmSync(root, { recursive: true }));
  return root;
}
test("resource manifest resolves logical/published aliases and blocks private paths, ambiguity and symlink escapes", (t) => {
  const root = fixture(t);
  fs.mkdirSync(root + "/res");
  fs.writeFileSync(root + "/res/map-aabbccddee.bin", "map");
  fs.writeFileSync(
    root + "/version.zip",
    zipSync({
      "version.json": strToU8(
        JSON.stringify({ "res/map.bin": "res/map-aabbccddee.bin" }),
      ),
    }),
  );
  assert.equal(resolve(root, "res/map.bin"), root + "/res/map-aabbccddee.bin");
  assert.equal(
    resolve(root, "res/map-aabbccddee.bin"),
    root + "/res/map-aabbccddee.bin",
  );
  for (const n of [
    "../x",
    "data/x.json",
    ".git/config",
    "res/../secret",
    "res/backups/x.json",
    "/etc/passwd",
    "res\\secret",
  ])
    assert.equal(safeName(n), false);
  fs.symlinkSync("/etc/passwd", root + "/res/escape.txt");
  assert.equal(resolve(root, "res/escape.txt"), null);
  fs.writeFileSync(root + "/res/other-1234567890.bin", "a");
  fs.writeFileSync(root + "/res/other-abcdef0123.bin", "b");
  assert.throws(
    () => resolve(root, "res/other.bin"),
    (e) => e.code === "asset_ambiguous",
  );
});
test("duplicate manifest entries are rejected, prepared bundle version mismatch is explicit and disk file stays unchanged", (t) => {
  const root = fixture(t);
  fs.writeFileSync(
    root + "/version.zip",
    zipSync({
      "version.json": strToU8(
        '{"a.js":"a-1234567890.js","a.js":"a-abcdef0123.js"}',
      ),
    }),
  );
  assert.throws(
    () => manifest(root),
    (e) => e.code === "invalid_manifest",
  );
  const def = jsonFile("client-patches.json");
  fs.mkdirSync(root + "/js");
  const file = root + "/" + def.relative;
  fs.writeFileSync(file, "unrecognized-client");
  const before = hash(fs.readFileSync(file));
  assert.throws(
    () => new Assets(root).body(def.relative, file),
    (e) => e.code === "game_client_version_mismatch",
  );
  assert.equal(hash(fs.readFileSync(file)), before);
  assert.equal(new Assets(root).locate("data/players.sqlite3"), null);
});

test("an explicitly fingerprinted compatible client is patched only in memory and still requires every unique anchor", (t) => {
  const root = fixture(t), file = root + "/client.js";
  const source = Buffer.from("const oldValue = 1;");
  fs.writeFileSync(file, source);
  const assets = new Assets(root);
  assets.patch = {
    relative: "client.js",
    prepared_sha256: hash(Buffer.from("previous-client")),
    compatible_sha256: [hash(source)],
    patches: [["oldValue", "newValue"]],
  };
  assert.equal(assets.body("client.js", file).toString(), "const newValue = 1;");
  assert.equal(assets.body("logical-client-alias.js", file).toString(), "const newValue = 1;",
    "a manifest alias for the same recognized bundle must receive its memory overlay too");
  assert.deepEqual(fs.readFileSync(file), source);

  for (const anchor of ["absent", "const"]) {
    const badSource = anchor === "const" ? Buffer.from("const a=1;const b=2;") : source;
    fs.writeFileSync(file, badSource);
    assets.overlayCache = null;
    assets.patch.compatible_sha256 = [hash(badSource)];
    assets.patch.patches = [[anchor, "replacement"]];
    assert.throws(() => assets.body("client.js", file), e => e.code === "game_client_version_mismatch");
    assert.deepEqual(fs.readFileSync(file), badSource);
  }
  fs.writeFileSync(file, "another-unrecognized-client");
  assets.overlayCache = null;
  assert.throws(() => assets.body("client.js", file), e => e.code === "game_client_version_mismatch");
});
