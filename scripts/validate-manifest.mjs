import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(
  readFileSync(path.join(root, "manifest.json"), "utf8"),
);

assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.background.type, "module");
assert.ok(existsSync(path.join(root, manifest.background.service_worker)));
assert.ok(existsSync(path.join(root, manifest.action.default_popup)));
assert.ok(manifest.permissions.includes("tabs"));
assert.ok(manifest.permissions.includes("tabGroups"));
assert.equal(manifest.permissions.includes("scripting"), false);
assert.equal("host_permissions" in manifest, false);
assert.ok(
  manifest.commands._execute_action.suggested_key.mac.includes("Command"),
);

console.log("ok - manifest validates for local MV3 label/popup fallback");
