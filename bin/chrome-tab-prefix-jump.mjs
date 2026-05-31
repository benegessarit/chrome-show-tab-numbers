#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import {
  LABEL_ALPHABET,
  buildHintRows,
  stripHintPrefix,
} from "../lib/labels.js";

export const CHROME_BUNDLE_ID = "com.google.Chrome";
export const DEFAULT_STATE_DIR =
  "/Users/davidbeyer/.local/state/chrome-tab-prefix-jump";
export const JAVASCRIPT_FROM_APPLE_EVENTS_SETUP_INSTRUCTION =
  "Chrome is blocking JavaScript from Apple Events. In Chrome, use View > Developer > Allow JavaScript from Apple Events, then rerun chrome-tab-prefix-jump doctor.";

const OSA_SCRIPT = "/usr/bin/osascript";
const STATE_FILE = "state.json";
const LOCK_DIR = "state.lock";
const LOCK_TIMEOUT_MS = 3000;
const LOCK_STALE_MS = 10000;
const PAGE_CACHE_KEY = "__chromeTabPrefixJumpHints";
const LEGACY_PAGE_CACHE_KEY = "tabFlashJumpHints";
const CREATED_FAVICON_ATTRIBUTE = "data-chrome-tab-prefix-jump-created";
const GENERATED_FAVICON_ATTRIBUTE = "data-chrome-tab-prefix-jump";

function defaultState() {
  return {
    generation: 0,
    held: false,
    lastAction: "init",
    lastReleaseReason: null,
    updatedAt: null,
  };
}

function nowIso() {
  return new Date().toISOString();
}

function statePath(stateDir = DEFAULT_STATE_DIR) {
  return join(stateDir, STATE_FILE);
}

function lockPath(stateDir = DEFAULT_STATE_DIR) {
  return join(stateDir, LOCK_DIR);
}

function ensureStateDir(stateDir = DEFAULT_STATE_DIR) {
  mkdirSync(stateDir, { recursive: true });
}

export function readState(stateDir = DEFAULT_STATE_DIR) {
  try {
    const raw = readFileSync(statePath(stateDir), "utf8");
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch (error) {
    if (error.code === "ENOENT") {
      return defaultState();
    }
    throw error;
  }
}

function writeState(stateDir, state) {
  ensureStateDir(stateDir);
  writeFileSync(
    statePath(stateDir),
    `${JSON.stringify({ ...defaultState(), ...state }, null, 2)}\n`,
  );
}

async function acquireLock(stateDir = DEFAULT_STATE_DIR) {
  ensureStateDir(stateDir);
  const path = lockPath(stateDir);
  const startedAt = Date.now();

  while (true) {
    try {
      mkdirSync(path);
      writeFileSync(join(path, "pid"), String(process.pid));
      return () => rmSync(path, { force: true, recursive: true });
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }

      try {
        const age = Date.now() - statSync(path).mtimeMs;
        if (age > LOCK_STALE_MS) {
          rmSync(path, { force: true, recursive: true });
          continue;
        }
      } catch (statError) {
        if (statError.code !== "ENOENT") {
          throw statError;
        }
      }

      if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
        throw new Error(`Timed out waiting for helper state lock at ${path}`);
      }

      await sleep(10);
    }
  }
}

async function withStateLock(stateDir, callback) {
  const release = await acquireLock(stateDir);
  try {
    return await callback();
  } finally {
    release();
  }
}

export function normalizeOneKeyLabel(label) {
  const normalized = String(label ?? "")
    .trim()
    .toLowerCase();
  return LABEL_ALPHABET.includes(normalized) ? normalized : null;
}

export function titleHasVisiblePrefix(title, label) {
  const normalizedLabel = normalizeOneKeyLabel(label);
  if (!normalizedLabel) {
    return false;
  }

  const match = /^\[([^\]\r\n]{1,4})\](?:\s|$)/u.exec(String(title ?? ""));
  return match?.[1]?.toLowerCase() === normalizedLabel;
}

export function renderHintTitle(title, label) {
  const normalizedLabel = normalizeOneKeyLabel(label);
  if (!normalizedLabel) {
    throw new Error(`Invalid one-key label: ${label}`);
  }

  const baseTitle = stripHintPrefix(title || "Untitled tab") || "Untitled tab";
  return `[${normalizedLabel.toUpperCase()}] ${baseTitle}`.trim();
}

export function restoreTitle(title, cache = {}) {
  if (cache.originalTitleCaptured) {
    return (
      stripHintPrefix(cache.originalTitle || "Untitled tab") || "Untitled tab"
    );
  }

  return stripHintPrefix(title || "Untitled tab") || "Untitled tab";
}

export function buildChromeHintRows(chromeTabs) {
  const normalizedTabs = chromeTabs.map((tab, position) => {
    const zeroBasedIndex = Number.isInteger(tab.index) ? tab.index : position;
    const tabIndex = zeroBasedIndex + 1;
    return {
      active: Boolean(tab.active),
      audible: Boolean(tab.audible),
      discarded: Boolean(tab.discarded),
      favIconUrl: tab.favIconUrl ?? "",
      groupId: tab.groupId ?? -1,
      highlighted: Boolean(tab.highlighted),
      id: tabIndex,
      index: zeroBasedIndex,
      pinned: Boolean(tab.pinned),
      title: tab.title || tab.url || "Untitled tab",
      url: tab.url ?? "",
      windowId: tab.windowId ?? 1,
      __rawTitle: tab.title || tab.url || "Untitled tab",
      __tabIndex: tabIndex,
    };
  });

  const tabsByTabId = new Map(normalizedTabs.map((tab) => [tab.id, tab]));

  return buildHintRows(normalizedTabs).map((row) => {
    const sourceTab = tabsByTabId.get(row.tabId);
    return {
      ...row,
      rawTitle: sourceTab?.__rawTitle ?? row.title,
      tabIndex: sourceTab?.__tabIndex ?? row.tabId,
    };
  });
}

export function filterOneKeyRows(rows) {
  return rows.filter((row) => normalizeOneKeyLabel(row.label) === row.label);
}

export function findJumpTarget(rows, label) {
  const normalizedLabel = normalizeOneKeyLabel(label);
  if (!normalizedLabel) {
    return null;
  }

  const oneKeyRows = filterOneKeyRows(rows);
  return (
    oneKeyRows.find((row) =>
      titleHasVisiblePrefix(row.rawTitle, normalizedLabel),
    ) ??
    oneKeyRows.find((row) => row.label === normalizedLabel) ??
    null
  );
}

function normalizeTabsResult(result) {
  if (Array.isArray(result)) {
    return result;
  }

  if (Array.isArray(result?.tabs)) {
    return result.tabs;
  }

  return [];
}

function svgBadgeDataUrl(label, isActive) {
  const safeLabel = label.toUpperCase().replace(/[<&>]/g, "");
  const background = isActive ? "#F4C542" : "#111827";
  const foreground = isActive ? "#111827" : "#F9FAFB";
  const ring = isActive ? "#111827" : "#F4C542";
  const fontSize = safeLabel.length > 1 ? 34 : 42;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${background}"/><rect x="4" y="4" width="56" height="56" rx="11" fill="none" stroke="${ring}" stroke-width="5"/><text x="32" y="43" text-anchor="middle" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="${fontSize}" font-weight="900" fill="${foreground}">${safeLabel}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function buildShowJavascript(row) {
  const payload = {
    active: Boolean(row.active),
    faviconHref: svgBadgeDataUrl(row.label, row.active),
    label: row.label,
    renderedTitle: renderHintTitle(row.rawTitle ?? row.title, row.label),
  };

  return `(() => {
    const payload = ${JSON.stringify(payload)};
    const cacheKey = ${JSON.stringify(PAGE_CACHE_KEY)};
    const createdFaviconAttribute = ${JSON.stringify(CREATED_FAVICON_ATTRIBUTE)};
    const generatedFaviconAttribute = ${JSON.stringify(GENERATED_FAVICON_ATTRIBUTE)};
    const cache = document[cacheKey] ?? {};

    function findOrCreateFavicon() {
      const existingIcon = document.querySelector('link[rel~="icon"]');
      if (existingIcon) {
        return existingIcon;
      }

      const icon = document.createElement("link");
      icon.setAttribute("rel", "icon");
      icon.setAttribute(createdFaviconAttribute, "true");
      (document.head || document.documentElement).append(icon);
      cache.createdFavicon = true;
      return icon;
    }

    if (!cache.originalTitleCaptured) {
      cache.originalTitleCaptured = true;
      cache.originalTitle = document.title || "Untitled tab";
    }

    const icon = findOrCreateFavicon();
    if (!cache.originalFaviconCaptured) {
      cache.originalFaviconCaptured = true;
      cache.originalFaviconHref = icon.getAttribute("href") || "";
      cache.originalFaviconType = icon.getAttribute("type") || "";
      cache.originalFaviconWasGenerated = icon.getAttribute(createdFaviconAttribute) === "true";
    }

    document.title = payload.renderedTitle;
    icon.setAttribute("type", "image/svg+xml");
    icon.setAttribute("href", payload.faviconHref);
    icon.setAttribute(generatedFaviconAttribute, payload.label);

    cache.active = payload.active;
    cache.label = payload.label;
    cache.renderedFaviconHref = payload.faviconHref;
    cache.renderedTitle = payload.renderedTitle;
    document[cacheKey] = cache;
  })();`;
}

export function buildRestoreJavascript() {
  return `(() => {
    const cacheKey = ${JSON.stringify(PAGE_CACHE_KEY)};
    const legacyCacheKey = ${JSON.stringify(LEGACY_PAGE_CACHE_KEY)};
    const createdFaviconAttribute = ${JSON.stringify(CREATED_FAVICON_ATTRIBUTE)};
    const generatedFaviconAttribute = ${JSON.stringify(GENERATED_FAVICON_ATTRIBUTE)};
    const tabPrefixPattern = /^(?:[◆◇]\\s*[A-Z;]{1,4}\\s*[◆◇]|\\[[A-Z;]{1,4}\\])\\s*/i;
    const numberedPattern = /^[-+]?\\d+\\. ?/;
    const notificationCountPattern = /^(\\(\\d+\\)) [-+]?\\d+\\. (?:\\(\\d+\\) )?/;

    function stripKnownPrefix(title) {
      return String(title || "Untitled tab")
        .replace(tabPrefixPattern, "")
        .replace(numberedPattern, "")
        .replace(notificationCountPattern, "$1 ")
        .trim() || "Untitled tab";
    }

    function titleHasMatchingBracketPrefix(title, label) {
      const normalizedLabel = String(label || "").toLowerCase();
      if (!normalizedLabel) {
        return false;
      }
      const expectedPrefix = "[" + normalizedLabel + "]";
      const normalizedTitle = String(title || "").toLowerCase();
      return (
        normalizedTitle === expectedPrefix ||
        normalizedTitle.startsWith(expectedPrefix + " ")
      );
    }

    function restoreTitleIfStillHelperOwned(cache, legacyCache) {
      const currentTitle = String(document.title || "Untitled tab");
      const renderedTitle = cache.renderedTitle
        ? String(cache.renderedTitle)
        : legacyCache.renderedTitle
          ? String(legacyCache.renderedTitle)
          : "";
      const label = cache.label ?? legacyCache.label;

      if (cache.originalTitleCaptured) {
        if (!renderedTitle || currentTitle === renderedTitle) {
          document.title = stripKnownPrefix(cache.originalTitle || currentTitle);
        } else if (titleHasMatchingBracketPrefix(currentTitle, label)) {
          document.title = stripKnownPrefix(currentTitle);
        }
        return;
      }

      if (legacyCache.baseTitle) {
        if (!renderedTitle || currentTitle === renderedTitle) {
          document.title = stripKnownPrefix(legacyCache.baseTitle);
        } else if (titleHasMatchingBracketPrefix(currentTitle, label)) {
          document.title = stripKnownPrefix(currentTitle);
        }
      }
    }

    const cache = document[cacheKey] ?? {};
    const legacyCache = document[legacyCacheKey] ?? {};
    restoreTitleIfStillHelperOwned(cache, legacyCache);

    const generatedIcon = document.querySelector(
      'link[rel~="icon"][' +
        generatedFaviconAttribute +
        '], link[rel~="icon"][data-tab-flash-jump-hints="true"]',
    );
    const originalFaviconCaptured =
      cache.originalFaviconCaptured || legacyCache.originalFaviconCaptured;
    const originalFaviconHref = cache.originalFaviconCaptured
      ? cache.originalFaviconHref
      : legacyCache.originalFaviconHref;
    const originalFaviconType = cache.originalFaviconCaptured
      ? cache.originalFaviconType
      : legacyCache.originalFaviconType;
    const renderedFaviconHref = cache.renderedFaviconHref || "";
    const faviconWasCreated = Boolean(cache.createdFavicon || legacyCache.createdFavicon);
    const faviconStillHelperOwned =
      generatedIcon &&
      (!renderedFaviconHref ||
        (generatedIcon.getAttribute("href") || "") === renderedFaviconHref);

    if (faviconStillHelperOwned && originalFaviconCaptured) {
      if (faviconWasCreated && !originalFaviconHref) {
        generatedIcon.remove();
      } else {
        if (originalFaviconHref) {
          generatedIcon.setAttribute("href", originalFaviconHref);
        } else {
          generatedIcon.removeAttribute("href");
        }
        if (originalFaviconType) {
          generatedIcon.setAttribute("type", originalFaviconType);
        } else {
          generatedIcon.removeAttribute("type");
        }
        generatedIcon.removeAttribute(generatedFaviconAttribute);
        generatedIcon.removeAttribute(createdFaviconAttribute);
        generatedIcon.removeAttribute("data-tab-flash-jump-hints");
      }
    } else if (generatedIcon) {
      generatedIcon.removeAttribute(generatedFaviconAttribute);
      generatedIcon.removeAttribute(createdFaviconAttribute);
      generatedIcon.removeAttribute("data-tab-flash-jump-hints");
    }

    delete document[cacheKey];
    delete document[legacyCacheKey];
  })();`;
}

function runJxa(script) {
  const result = spawnSync(OSA_SCRIPT, ["-l", "JavaScript", "-e", script], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });

  if (result.status !== 0) {
    const message = (
      result.stderr ||
      result.stdout ||
      "osascript failed"
    ).trim();
    const error = new Error(message);
    error.status = result.status;
    error.stderr = result.stderr;
    error.stdout = result.stdout;
    throw error;
  }

  return result.stdout.trim();
}

export function isJavascriptFromAppleEventsBlocked(error) {
  const message = `${error?.message ?? ""}\n${error?.stderr ?? ""}\n${error?.stdout ?? ""}`;
  return message.includes("-1723") || /Access not allowed/i.test(message);
}

export function assertJavascriptExecutionSucceeded(parsed, actionCount) {
  const failedResults = (parsed.results ?? []).filter((result) => !result.ok);
  const actionErrors = failedResults.map((result) => result.error).join("\n");

  if (
    actionErrors &&
    isJavascriptFromAppleEventsBlocked({ message: actionErrors })
  ) {
    throw new Error(actionErrors);
  }

  if (actionCount > 0 && parsed.count === 0) {
    throw new Error(
      `No Chrome tab JavaScript actions succeeded: ${actionErrors || "unknown error"}`,
    );
  }
}

export async function queryChromeTabs() {
  const output = runJxa(`(() => {
    const chrome = Application(${JSON.stringify(CHROME_BUNDLE_ID)});
    if (!chrome.running()) {
      return JSON.stringify({ ok: false, error: "Chrome is not running", tabs: [] });
    }

    const windows = chrome.windows();
    if (windows.length === 0) {
      return JSON.stringify({ ok: true, activeTabIndex: 0, tabs: [] });
    }

    const window = windows[0];
    const activeTabIndex = window.activeTabIndex();
    const tabs = window.tabs().map((tab, index) => ({
      active: index + 1 === activeTabIndex,
      index,
      title: tab.title(),
      url: tab.url(),
    }));
    return JSON.stringify({ ok: true, activeTabIndex, tabs });
  })();`);

  const parsed = JSON.parse(output);
  if (!parsed.ok) {
    throw new Error(parsed.error || "Could not query Chrome tabs");
  }
  return parsed.tabs;
}

export async function executeJavascriptInTabs(actions, kind = "execute") {
  if (!actions.length) {
    return { count: 0, kind, results: [] };
  }

  const payload = { actions, kind };
  const output = runJxa(`(() => {
    const payload = ${JSON.stringify(payload)};
    const chrome = Application(${JSON.stringify(CHROME_BUNDLE_ID)});
    if (!chrome.running()) {
      return JSON.stringify({ ok: false, error: "Chrome is not running", kind: payload.kind, results: [] });
    }

    const windows = chrome.windows();
    if (windows.length === 0) {
      return JSON.stringify({ ok: false, error: "Chrome has no front window", kind: payload.kind, results: [] });
    }

    const tabs = windows[0].tabs();
    const results = [];
    for (const action of payload.actions) {
      try {
        const tab = tabs[action.tabIndex - 1];
        if (!tab) {
          throw new Error("No tab at index " + action.tabIndex);
        }
        tab.execute({ javascript: action.javascript });
        results.push({ ok: true, tabIndex: action.tabIndex });
      } catch (error) {
        results.push({ ok: false, tabIndex: action.tabIndex, error: String(error.message || error) });
      }
    }

    return JSON.stringify({
      ok: true,
      count: results.filter((result) => result.ok).length,
      kind: payload.kind,
      results,
    });
  })();`);

  const parsed = JSON.parse(output);
  if (!parsed.ok) {
    throw new Error(
      parsed.error || "Could not execute JavaScript in Chrome tabs",
    );
  }

  assertJavascriptExecutionSucceeded(parsed, actions.length);

  return parsed;
}

export async function setActiveTabIndex(tabIndex) {
  const output = runJxa(`(() => {
    const chrome = Application(${JSON.stringify(CHROME_BUNDLE_ID)});
    if (!chrome.running()) {
      return JSON.stringify({ ok: false, error: "Chrome is not running" });
    }

    const windows = chrome.windows();
    if (windows.length === 0) {
      return JSON.stringify({ ok: false, error: "Chrome has no front window" });
    }

    windows[0].activeTabIndex.set(${Number(tabIndex)});
    return JSON.stringify({ ok: true, activeTabIndex: windows[0].activeTabIndex() });
  })();`);
  const parsed = JSON.parse(output);
  if (!parsed.ok) {
    throw new Error(
      parsed.error || `Could not activate Chrome tab ${tabIndex}`,
    );
  }
  return parsed;
}

export async function showHints({
  afterStart,
  executeJavascriptInTabs: executeJs = executeJavascriptInTabs,
  queryTabs = queryChromeTabs,
  stateDir = DEFAULT_STATE_DIR,
} = {}) {
  const generation = await withStateLock(stateDir, async () => {
    const state = readState(stateDir);
    const nextGeneration = Number(state.generation || 0) + 1;
    writeState(stateDir, {
      ...state,
      generation: nextGeneration,
      held: true,
      lastAction: "show-start",
      updatedAt: nowIso(),
    });
    return nextGeneration;
  });

  if (afterStart) {
    await afterStart({ generation });
  }

  const tabs = normalizeTabsResult(await queryTabs());
  const rows = filterOneKeyRows(buildChromeHintRows(tabs));
  const actions = rows.map((row) => ({
    javascript: buildShowJavascript(row),
    label: row.label,
    tabIndex: row.tabIndex,
  }));

  return await withStateLock(stateDir, async () => {
    const state = readState(stateDir);
    if (!state.held || state.generation !== generation) {
      return {
        currentGeneration: state.generation,
        generation,
        status: "aborted",
      };
    }

    const execution = await executeJs(actions, "show");
    writeState(stateDir, {
      ...state,
      held: true,
      lastAction: "show-complete",
      lastShownCount: execution.count ?? actions.length,
      updatedAt: nowIso(),
    });

    return {
      count: execution.count ?? actions.length,
      generation,
      status: "shown",
    };
  });
}

export async function releaseAndRestore(
  reason = "hide",
  {
    beforeRestore,
    executeJavascriptInTabs: executeJs = executeJavascriptInTabs,
    queryTabs = queryChromeTabs,
    stateDir = DEFAULT_STATE_DIR,
  } = {},
) {
  return await withStateLock(stateDir, async () => {
    const state = readState(stateDir);
    const nextGeneration = Number(state.generation || 0) + 1;
    const releasedState = {
      ...state,
      generation: nextGeneration,
      held: false,
      lastAction: "restore-start",
      lastReleaseReason: reason,
      updatedAt: nowIso(),
    };
    writeState(stateDir, releasedState);

    if (beforeRestore) {
      await beforeRestore();
    }

    const tabs = normalizeTabsResult(await queryTabs());
    const rows = buildChromeHintRows(tabs);
    const restoreJavascript = buildRestoreJavascript();
    const actions = rows.map((row) => ({
      javascript: restoreJavascript,
      label: row.label,
      tabIndex: row.tabIndex,
    }));
    const execution = await executeJs(actions, "restore");

    writeState(stateDir, {
      ...releasedState,
      lastAction: "restore-complete",
      lastRestoredCount: execution.count ?? actions.length,
      updatedAt: nowIso(),
    });

    return {
      count: execution.count ?? actions.length,
      generation: nextGeneration,
      reason,
      status: "restored",
    };
  });
}

export async function jumpToLabel(
  label,
  {
    executeJavascriptInTabs: executeJs = executeJavascriptInTabs,
    queryTabs = queryChromeTabs,
    setActiveTabIndex: activateTab = setActiveTabIndex,
    stateDir = DEFAULT_STATE_DIR,
  } = {},
) {
  const normalizedLabel = normalizeOneKeyLabel(label);
  if (!normalizedLabel) {
    return { error: `Invalid one-key label: ${label}`, status: "invalid" };
  }

  const tabs = normalizeTabsResult(await queryTabs());
  const rows = buildChromeHintRows(tabs);
  const target = findJumpTarget(rows, normalizedLabel);

  if (!target) {
    const release = await releaseAndRestore("jump-miss", {
      executeJavascriptInTabs: executeJs,
      queryTabs: async () => tabs,
      stateDir,
    });
    return { label: normalizedLabel, release, status: "missing" };
  }

  const release = await releaseAndRestore("jump", {
    beforeRestore: async () => activateTab(target.tabIndex),
    executeJavascriptInTabs: executeJs,
    queryTabs: async () => tabs,
    stateDir,
  });

  return {
    label: normalizedLabel,
    release,
    status: "jumped",
    target: {
      label: target.label,
      tabIndex: target.tabIndex,
      title: target.title,
    },
  };
}

export async function doctor() {
  try {
    const output = runJxa(`(() => {
      const chrome = Application(${JSON.stringify(CHROME_BUNDLE_ID)});
      if (!chrome.running()) {
        return JSON.stringify({ ok: false, error: "Chrome is not running" });
      }
      const windows = chrome.windows();
      if (windows.length === 0) {
        return JSON.stringify({ ok: false, error: "Chrome has no front window" });
      }
      const result = windows[0].activeTab().execute({ javascript: "1+1" });
      return JSON.stringify({ ok: true, result });
    })();`);
    const parsed = JSON.parse(output);
    if (!parsed.ok) {
      return { error: parsed.error, status: "blocked" };
    }
    return { status: "pass" };
  } catch (error) {
    if (isJavascriptFromAppleEventsBlocked(error)) {
      return {
        message: JAVASCRIPT_FROM_APPLE_EVENTS_SETUP_INSTRUCTION,
        status: "setup-required",
      };
    }
    return { error: error.message, status: "blocked" };
  }
}

function elapsedMs(startedAt) {
  return Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000);
}

function printUsage() {
  console.log("Usage: chrome-tab-prefix-jump doctor|show|hide|jump <label>");
}

async function main(argv = process.argv.slice(2)) {
  const [command, label] = argv;
  const startedAt = process.hrtime.bigint();

  if (command === "doctor") {
    const result = await doctor();
    const ms = elapsedMs(startedAt);
    if (result.status === "pass") {
      console.log(`ok - doctor pass (${ms} ms)`);
      return;
    }
    if (result.status === "setup-required") {
      console.log(result.message);
      console.log(`setup-required - doctor (${ms} ms)`);
      process.exitCode = 2;
      return;
    }
    console.error(result.error || "doctor blocked");
    console.error(`blocked - doctor (${ms} ms)`);
    process.exitCode = 1;
    return;
  }

  if (command === "show") {
    const result = await showHints();
    console.log(
      `ok - show ${result.status} ${result.count ?? 0} tabs (${elapsedMs(startedAt)} ms)`,
    );
    return;
  }

  if (command === "hide") {
    const result = await releaseAndRestore("hide");
    console.log(
      `ok - hide restored ${result.count ?? 0} tabs (${elapsedMs(startedAt)} ms)`,
    );
    return;
  }

  if (command === "jump") {
    const result = await jumpToLabel(label);
    const ms = elapsedMs(startedAt);
    if (result.status === "jumped") {
      console.log(
        `ok - jump ${result.label} -> tab ${result.target.tabIndex}, restored ${result.release.count ?? 0} tabs (${ms} ms)`,
      );
      return;
    }
    if (result.status === "missing") {
      console.log(
        `ok - jump ${result.label} missing, restored ${result.release.count ?? 0} tabs (${ms} ms)`,
      );
      return;
    }
    console.error(result.error || `Could not jump to ${label}`);
    process.exitCode = 1;
    return;
  }

  printUsage();
  process.exitCode = 64;
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (entrypoint === import.meta.url) {
  main().catch((error) => {
    if (isJavascriptFromAppleEventsBlocked(error)) {
      console.error(JAVASCRIPT_FROM_APPLE_EVENTS_SETUP_INSTRUCTION);
    } else {
      console.error(error.message);
    }
    process.exitCode = 1;
  });
}

export const __dirname = dirname(fileURLToPath(import.meta.url));
export const helperIsInstalled = existsSync(
  "/Users/davidbeyer/.local/bin/chrome-tab-prefix-jump",
);
