import assert from "node:assert/strict";
import {
  LABEL_ALPHABET,
  buildHintRows,
  isInjectableUrl,
  labelForIndex,
  stripHintPrefix,
} from "../lib/labels.js";

assert.equal(labelForIndex(0), "a");
assert.equal(labelForIndex(1), "b");
assert.equal(labelForIndex(7), "h");
assert.equal(labelForIndex(LABEL_ALPHABET.length - 1), "z");
assert.equal(labelForIndex(LABEL_ALPHABET.length), "aa");
assert.equal(labelForIndex(LABEL_ALPHABET.length + 1), "ab");
assert.throws(() => labelForIndex(-1), /non-negative/);

assert.equal(isInjectableUrl("https://example.com"), true);
assert.equal(isInjectableUrl("http://example.com"), true);
assert.equal(isInjectableUrl("chrome://extensions"), false);
assert.equal(isInjectableUrl("https://chrome.google.com/webstore"), false);
assert.equal(isInjectableUrl(""), false);

assert.equal(stripHintPrefix("[A] Inbox"), "Inbox");
assert.equal(stripHintPrefix("[;] Docs"), "Docs");
assert.equal(stripHintPrefix("◆ A ◆ Inbox"), "Inbox");
assert.equal(stripHintPrefix("◇ ; ◇ Docs"), "Docs");
assert.equal(stripHintPrefix("3. Calendar"), "Calendar");
assert.equal(stripHintPrefix("(2) 4. Mail"), "(2) Mail");

const rows = buildHintRows(
  [
    {
      active: false,
      groupId: -1,
      id: 10,
      index: 2,
      title: "Third",
      url: "https://third.example",
      windowId: 1,
    },
    {
      active: true,
      groupId: -1,
      id: 8,
      index: 0,
      title: "First",
      url: "https://first.example",
      windowId: 1,
    },
    {
      active: false,
      groupId: 3,
      id: 9,
      index: 1,
      title: "Collapsed",
      url: "https://hidden.example",
      windowId: 1,
    },
    {
      active: false,
      groupId: -1,
      id: 11,
      index: 3,
      title: "Chrome",
      url: "chrome://extensions",
      windowId: 1,
    },
  ],
  { collapsedTabGroupIds: new Set([3]) },
);

assert.deepEqual(
  rows.map((row) => [row.label, row.tabId, row.title, row.injectable]),
  [
    ["a", 8, "First", true],
    ["b", 10, "Third", true],
  ],
);

const popupRows = buildHintRows(
  [
    {
      active: false,
      groupId: -1,
      id: 1,
      index: 0,
      title: "Chrome settings",
      url: "chrome://extensions",
      windowId: 1,
    },
    {
      active: true,
      groupId: -1,
      id: 2,
      index: 1,
      title: "First normal",
      url: "https://first.example",
      windowId: 1,
    },
    {
      active: false,
      groupId: -1,
      id: 3,
      index: 2,
      title: "Second normal",
      url: "https://second.example",
      windowId: 1,
    },
    {
      active: false,
      groupId: 9,
      id: 4,
      index: 3,
      title: "Collapsed restricted",
      url: "chrome://bookmarks",
      windowId: 1,
    },
  ],
  { collapsedTabGroupIds: new Set([9]), includeRestricted: true },
);

assert.deepEqual(
  popupRows.map((row) => [row.label, row.tabId, row.title, row.injectable]),
  [
    ["c", 1, "Chrome settings", false],
    ["a", 2, "First normal", true],
    ["b", 3, "Second normal", true],
  ],
);

console.log(
  `ok - ${rows.length} labeled rows, ${LABEL_ALPHABET.length} one-key labels`,
);
