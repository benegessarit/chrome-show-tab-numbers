import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const modulePath = "hammerspoon/chrome-tab-jump-hints.lua";
const initPath = "hammerspoon/init.lua";
const source = readFileSync(modulePath, "utf8");
const initSource = readFileSync(initPath, "utf8");

assert.equal(existsSync(modulePath), true);
assert.equal(existsSync(initPath), true);
assert.match(source, /M\.CHROME_BUNDLE_ID\s*=\s*"com\.google\.Chrome"/);
assert.match(source, /M\.HYPER_TRIGGER_KEY_CODE\s*=\s*40/);
assert.match(source, /M\.KARABINER_TRIGGER_KEY_CODE\s*=\s*79/);
assert.match(source, /M\.REFRESH_INTERVAL_SECONDS\s*=\s*0\.5/);
assert.match(source, /M\.CACHE_STALE_SECONDS\s*=\s*1\.0/);
assert.match(source, /M\.MODAL_TIMEOUT_SECONDS\s*=\s*3\.0/);
assert.match(source, /M\.MAX_ONE_KEY_TABS\s*=\s*26/);
assert.match(source, /M\.LABEL_WIDTH\s*=\s*16/);
assert.match(source, /M\.LABEL_HEIGHT\s*=\s*14/);
assert.match(source, /M\.LABEL_TEXT_SIZE\s*=\s*10/);
assert.doesNotMatch(source, /LABEL_LEFT_OFFSET/);
assert.match(
  source,
  /M\.VIMIUM_HINT_FILL\s*=\s*\{ red = 1\.00, green = 0\.87, blue = 0\.39, alpha = 0\.92 \}/,
);
assert.match(
  source,
  /M\.VIMIUM_HINT_STROKE\s*=\s*\{ red = 0\.76, green = 0\.54, blue = 0\.13, alpha = 0\.88 \}/,
);
assert.match(
  source,
  /M\.VIMIUM_HINT_TEXT\s*=\s*\{ red = 0\.19, green = 0\.15, blue = 0\.02, alpha = 0\.98 \}/,
);
assert.match(source, /#fff785 to #ffc542/);
assert.match(source, /#c38a22/);
assert.match(source, /#302505/);
assert.match(source, /\(tabWidth - labelWidth\) \/ 2/);
assert.match(source, /math\.floor\(x \+ 0\.5\)/);
assert.match(source, /hs\.axuielement\.applicationElement/);
assert.match(source, /AXTabGroup/);
assert.match(source, /AXRadioButton/);
assert.match(source, /AXFrame/);
assert.match(source, /tabFrame\.x - windowFrame\.x/);
assert.match(source, /#self\.cache\.rows == 0[\s\S]*self:refreshCache\(\)/);
assert.match(
  source,
  /if self\.modalActive then[\s\S]*self:cancelModal\(\)[\s\S]*return true/,
);
assert.doesNotMatch(source, /Menlo-Bold/);
assert.match(source, /textFont = "Helvetica-Bold"/);
assert.match(source, /textSize = M\.LABEL_TEXT_SIZE/);
assert.doesNotMatch(source, /LEFT_CONTROL_KEY_CODE/);
assert.doesNotMatch(source, /ctrlHeld/);
assert.doesNotMatch(source, /event\.types\.flagsChanged/);
assert.match(source, /event\.types\.keyDown/);
assert.match(source, /hs\.canvas\.new/);
assert.match(source, /:show\(0\)/);
assert.match(source, /hs\.osascript\.javascript/);
assert.match(source, /activeTabIndex\.set/);
assert.match(source, /M\.LABELS\s*=\s*\{/);
assert.match(source, /"a", "b", "c", "d"/);
assert.match(source, /"w", "x", "y", "z"/);
assert.match(source, /\[";"\]\s*=\s*41/);
assert.match(source, /function M\.start/);
assert.match(initSource, /hs\.ipc\.cliInstall\(\)/);
assert.match(initSource, /tabJumpHints\.start\(\)/);
assert.match(initSource, /chrome-tab-jump-hints/);

const moduleSyntax = spawnSync("/opt/homebrew/bin/luac", ["-p", modulePath], {
  encoding: "utf8",
});
assert.equal(
  moduleSyntax.status,
  0,
  moduleSyntax.stderr || moduleSyntax.stdout,
);
const initSyntax = spawnSync("/opt/homebrew/bin/luac", ["-p", initPath], {
  encoding: "utf8",
});
assert.equal(initSyntax.status, 0, initSyntax.stderr || initSyntax.stdout);

console.log("ok - Hammerspoon resident overlay contract and syntax");
