import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backgroundSource = readFileSync(
  new URL("../background.js", import.meta.url),
  "utf8",
);

assert.doesNotMatch(
  backgroundSource,
  /requestToUpdateAll/,
  "background service worker must not schedule always-on title updates",
);
assert.doesNotMatch(
  backgroundSource,
  /chrome\.scripting\.executeScript/,
  "extension background must not mutate page titles/favicons by default",
);
assert.doesNotMatch(
  backgroundSource,
  /chrome\.tabs\.on(?:Activated|Created|Moved|Removed|Updated)\.addListener\([^)]*update/i,
  "tab events must not refresh visible prefixes automatically",
);

const refreshHintsIndex = backgroundSource.indexOf(
  'message?.type === "refresh-hints"',
);
assert.notEqual(
  refreshHintsIndex,
  -1,
  "refresh-hints branch should still exist",
);
const refreshHintsBranch = backgroundSource.slice(
  Math.max(0, refreshHintsIndex - 120),
  refreshHintsIndex + 260,
);

assert.match(
  refreshHintsBranch,
  /getHintRows\(/,
  "refresh-hints should keep returning popup label rows",
);
assert.match(
  backgroundSource,
  /includeRestricted:\s*true/,
  "popup refresh should include restricted pages as popup-only fallback rows",
);
assert.doesNotMatch(
  refreshHintsBranch,
  /updateAll|updateTabHint|executeScript|requestToUpdateAll/,
  "refresh-hints must not re-add visible prefixes",
);

const activateLabelBranch = /async function activateLabel\([\s\S]*?\n\}/.exec(
  backgroundSource,
)?.[0];
assert.ok(
  activateLabelBranch,
  "activateLabel should still exist for popup jumps",
);
assert.doesNotMatch(
  activateLabelBranch,
  /requestToUpdateAll|updateAll|executeScript/,
  "popup activation must not leave always-on prefixes behind",
);

console.log("ok - background is hidden-by-default label/popup fallback");
