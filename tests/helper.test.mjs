import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";

import { LABEL_ALPHABET } from "../lib/labels.js";
import {
  CHROME_BUNDLE_ID,
  DEFAULT_STATE_DIR,
  JAVASCRIPT_FROM_APPLE_EVENTS_SETUP_INSTRUCTION,
  assertJavascriptExecutionSucceeded,
  buildChromeHintRows,
  buildRestoreJavascript,
  buildShowJavascript,
  filterOneKeyRows,
  findJumpTarget,
  jumpToLabel,
  normalizeOneKeyLabel,
  readState,
  releaseAndRestore,
  renderHintTitle,
  restoreTitle,
  showHints,
  titleHasVisiblePrefix,
} from "../bin/chrome-tab-prefix-jump.mjs";

assert.equal(CHROME_BUNDLE_ID, "com.google.Chrome");
assert.equal(
  DEFAULT_STATE_DIR,
  "/Users/davidbeyer/.local/state/chrome-tab-prefix-jump",
);
assert.equal(
  JAVASCRIPT_FROM_APPLE_EVENTS_SETUP_INSTRUCTION,
  "Chrome is blocking JavaScript from Apple Events. In Chrome, use View > Developer > Allow JavaScript from Apple Events, then rerun chrome-tab-prefix-jump doctor.",
);
assert.deepEqual(
  filterOneKeyRows(
    LABEL_ALPHABET.map((label, index) => ({ label, tabIndex: index + 1 })),
  ).map((row) => row.label),
  LABEL_ALPHABET,
);

assert.equal(normalizeOneKeyLabel("A"), "a");
assert.equal(normalizeOneKeyLabel(";"), ";");
assert.equal(normalizeOneKeyLabel("AA"), null);
assert.equal(normalizeOneKeyLabel("/"), null);

assert.equal(titleHasVisiblePrefix("[A] Inbox", "a"), true);
assert.equal(titleHasVisiblePrefix("[a] Inbox", "A"), true);
assert.equal(titleHasVisiblePrefix("[;] Docs", ";"), true);
assert.equal(titleHasVisiblePrefix("[AA] Inbox", "a"), false);
assert.equal(titleHasVisiblePrefix("◆ A ◆ Inbox", "a"), false);
assert.equal(titleHasVisiblePrefix("A Inbox", "a"), false);

assert.equal(renderHintTitle("Inbox", "a"), "[A] Inbox");
assert.equal(renderHintTitle("[S] Inbox", "a"), "[A] Inbox");
assert.equal(renderHintTitle("[;] Docs", ";"), "[;] Docs");
assert.equal(restoreTitle("[A] Inbox", {}), "Inbox");
assert.equal(restoreTitle("[;] Docs", {}), "Docs");
assert.equal(restoreTitle("[AA] Inbox", {}), "Inbox");
assert.equal(
  restoreTitle("[A] Rendered", {
    originalTitleCaptured: true,
    originalTitle: "Original",
  }),
  "Original",
);
assert.equal(
  restoreTitle("[A] Rendered", {
    originalTitleCaptured: true,
    originalTitle: "[A] Stale original",
  }),
  "Stale original",
);

function makeFakeIcon(attributes = {}) {
  const attrs = new Map(Object.entries(attributes));
  return {
    removed: false,
    getAttribute(name) {
      return attrs.get(name) ?? null;
    },
    remove() {
      this.removed = true;
    },
    removeAttribute(name) {
      attrs.delete(name);
    },
    setAttribute(name, value) {
      attrs.set(name, String(value));
    },
  };
}

function makeFakeDocument() {
  const icons = [
    makeFakeIcon({ href: "/favicon.ico", rel: "icon", type: "image/png" }),
  ];
  const append = (icon) => icons.push(icon);
  const document = {
    documentElement: { append },
    head: { append },
    title: "Inbox",
    createElement(tagName) {
      assert.equal(tagName, "link");
      return makeFakeIcon();
    },
    querySelector(selector) {
      const liveIcons = icons.filter((icon) => !icon.removed);
      if (
        selector.includes("data-chrome-tab-prefix-jump") ||
        selector.includes("data-tab-flash-jump-hints")
      ) {
        return (
          liveIcons.find(
            (icon) =>
              icon.getAttribute("data-chrome-tab-prefix-jump") !== null ||
              icon.getAttribute("data-tab-flash-jump-hints") === "true",
          ) ?? null
        );
      }
      if (selector === 'link[rel~="icon"]') {
        return (
          liveIcons.find((icon) => icon.getAttribute("rel") === "icon") ?? null
        );
      }
      return null;
    },
  };
  return { document, icons };
}

const fakePage = makeFakeDocument();
vm.runInNewContext(
  buildShowJavascript({
    active: true,
    label: "a",
    rawTitle: "Inbox",
    tabIndex: 1,
    title: "Inbox",
  }),
  { document: fakePage.document },
);
assert.equal(fakePage.document.title, "[A] Inbox");
assert.equal(fakePage.icons[0].getAttribute("type"), "image/svg+xml");
assert.equal(
  fakePage.icons[0].getAttribute("data-chrome-tab-prefix-jump"),
  "a",
);
vm.runInNewContext(buildRestoreJavascript(), { document: fakePage.document });
assert.equal(fakePage.document.title, "Inbox");
assert.equal(fakePage.icons[0].getAttribute("href"), "/favicon.ico");
assert.equal(fakePage.icons[0].getAttribute("type"), "image/png");
assert.equal(
  fakePage.icons[0].getAttribute("data-chrome-tab-prefix-jump"),
  null,
);

const untouchedPage = makeFakeDocument();
untouchedPage.document.title = "[AA] Real project";
vm.runInNewContext(buildRestoreJavascript(), {
  document: untouchedPage.document,
});
assert.equal(untouchedPage.document.title, "[AA] Real project");
assert.equal(untouchedPage.icons[0].getAttribute("href"), "/favicon.ico");

const staleTitlePage = makeFakeDocument();
staleTitlePage.document.title = "Inbox (1)";
vm.runInNewContext(
  buildShowJavascript({
    active: true,
    label: "a",
    rawTitle: "Inbox (1)",
    tabIndex: 1,
    title: "Inbox (1)",
  }),
  { document: staleTitlePage.document },
);
staleTitlePage.document.title = "Inbox (2)";
staleTitlePage.icons[0].setAttribute("href", "/fresh-favicon.ico");
staleTitlePage.icons[0].setAttribute("type", "image/png");
vm.runInNewContext(buildRestoreJavascript(), {
  document: staleTitlePage.document,
});
assert.equal(staleTitlePage.document.title, "Inbox (2)");
assert.equal(
  staleTitlePage.icons[0].getAttribute("href"),
  "/fresh-favicon.ico",
);
assert.equal(
  staleTitlePage.icons[0].getAttribute("data-chrome-tab-prefix-jump"),
  null,
);

const stalePrefixedPage = makeFakeDocument();
stalePrefixedPage.document.title = "Inbox (1)";
vm.runInNewContext(
  buildShowJavascript({
    active: true,
    label: "a",
    rawTitle: "Inbox (1)",
    tabIndex: 1,
    title: "Inbox (1)",
  }),
  { document: stalePrefixedPage.document },
);
stalePrefixedPage.document.title = "[A] Inbox (2)";
vm.runInNewContext(buildRestoreJavascript(), {
  document: stalePrefixedPage.document,
});
assert.equal(stalePrefixedPage.document.title, "Inbox (2)");

const mixedRows = buildChromeHintRows([
  {
    active: false,
    index: 0,
    title: "[A] Restricted should not consume",
    url: "chrome://extensions",
  },
  {
    active: false,
    index: 1,
    title: "First normal",
    url: "https://first.example",
  },
  { active: true, index: 2, title: "[;] Semi", url: "https://semi.example" },
  {
    active: false,
    index: 3,
    title: "Store",
    url: "https://chrome.google.com/webstore",
  },
  {
    active: false,
    index: 4,
    title: "Third normal",
    url: "https://third.example",
  },
]);

assert.deepEqual(
  mixedRows.map((row) => [row.label, row.tabIndex, row.title, row.rawTitle]),
  [
    ["a", 2, "First normal", "First normal"],
    ["s", 3, "Semi", "[;] Semi"],
    ["d", 5, "Third normal", "Third normal"],
  ],
);
assert.equal(findJumpTarget(mixedRows, "a")?.tabIndex, 2);
assert.equal(findJumpTarget(mixedRows, ";")?.tabIndex, 3);
assert.equal(findJumpTarget(mixedRows, "aa"), null);
assert.doesNotThrow(() =>
  assertJavascriptExecutionSucceeded(
    { count: 1, results: [{ ok: true, tabIndex: 1 }] },
    1,
  ),
);
assert.throws(
  () =>
    assertJavascriptExecutionSucceeded(
      {
        count: 0,
        results: [
          {
            error: "Error: Access not allowed. (-1723)",
            ok: false,
            tabIndex: 1,
          },
        ],
      },
      1,
    ),
  /Access not allowed/,
);
assert.throws(
  () => assertJavascriptExecutionSucceeded({ count: 0, results: [] }, 1),
  /No Chrome tab JavaScript actions succeeded/,
);

const overflowRows = buildChromeHintRows(
  Array.from({ length: LABEL_ALPHABET.length + 2 }, (_, index) => ({
    active: index === 0,
    index,
    title: `Tab ${index}`,
    url: `https://example-${index}.test`,
  })),
);
assert.equal(overflowRows.at(LABEL_ALPHABET.length)?.label, "aa");
assert.equal(filterOneKeyRows(overflowRows).length, LABEL_ALPHABET.length);
assert.equal(
  filterOneKeyRows(overflowRows).some((row) => row.label === "aa"),
  false,
);

function makeStateDir() {
  return mkdtempSync(join(tmpdir(), "chrome-tab-prefix-jump-test-"));
}

async function withStateDir(fn) {
  const stateDir = makeStateDir();
  try {
    return await fn(stateDir);
  } finally {
    rmSync(stateDir, { force: true, recursive: true });
  }
}

const fakeTabs = [
  { active: true, index: 0, title: "First", url: "https://first.example" },
  { active: false, index: 1, title: "Second", url: "https://second.example" },
];

await withStateDir(async (stateDir) => {
  const calls = [];
  const deps = {
    executeJavascriptInTabs: async (actions, kind) => {
      calls.push({ actions, kind });
      return { count: actions.length, results: [] };
    },
    queryTabs: async () => fakeTabs,
    stateDir,
  };

  const result = await showHints({
    ...deps,
    afterStart: async () => {
      await releaseAndRestore("hide", deps);
    },
  });

  assert.equal(result.status, "aborted");
  assert.equal(
    calls.some((call) => call.kind === "show"),
    false,
  );
  assert.equal(
    calls.some((call) => call.kind === "restore"),
    true,
  );
  assert.equal(readState(stateDir).held, false);
});

await withStateDir(async (stateDir) => {
  const calls = [];
  const deps = {
    executeJavascriptInTabs: async (actions, kind) => {
      calls.push({ actions, kind });
      return { count: actions.length, results: [] };
    },
    queryTabs: async () => fakeTabs,
    stateDir,
  };

  await releaseAndRestore("hide", deps);
  const result = await releaseAndRestore("hide", deps);

  assert.equal(result.status, "restored");
  assert.equal(readState(stateDir).held, false);
  assert.equal(calls.filter((call) => call.kind === "restore").length, 2);
});

await withStateDir(async (stateDir) => {
  const calls = [];
  const activated = [];
  const deps = {
    executeJavascriptInTabs: async (actions, kind) => {
      calls.push({ actions, kind });
      return { count: actions.length, results: [] };
    },
    queryTabs: async () => fakeTabs,
    setActiveTabIndex: async (tabIndex) => {
      activated.push(tabIndex);
    },
    stateDir,
  };

  await showHints(deps);
  const result = await jumpToLabel("S", deps);

  assert.equal(result.status, "jumped");
  assert.deepEqual(activated, [2]);
  assert.equal(readState(stateDir).held, false);
  assert.equal(readState(stateDir).lastReleaseReason, "jump");
  assert.equal(
    calls.some((call) => call.kind === "restore"),
    true,
  );
});

console.log(
  "ok - helper labels, JS title restore, state guard, and jump release path",
);
