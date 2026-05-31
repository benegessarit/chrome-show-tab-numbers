import { buildHintRows } from "./lib/labels.js";

const CONTEXT_MENU = {
  "tab-prefix-open-popup": {
    callback: openPopup,
    title: "Open tab jump list",
  },
};

chrome.runtime.onInstalled.addListener(createContextMenu);
chrome.contextMenus.onClicked.addListener(onMenuClicked);
chrome.runtime.onMessage.addListener(onMessage);

createContextMenu();

async function getHintRows() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const collapsedTabGroups = await findCollapsedTabGroups();
  const collapsedTabGroupIds = new Set(
    collapsedTabGroups.map((tabGroup) => tabGroup.id),
  );

  return buildHintRows(tabs, {
    collapsedTabGroupIds,
    includeRestricted: true,
  });
}

async function findCollapsedTabGroups() {
  try {
    return await chrome.tabGroups.query({
      collapsed: true,
      windowId: chrome.windows.WINDOW_ID_CURRENT,
    });
  } catch (error) {
    if (error.message?.includes("Grouping is not supported by tabs")) {
      return [];
    }

    console.warn("Could not query collapsed tab groups", error);
    return [];
  }
}

async function openPopup() {
  await chrome.action.openPopup?.();
}

function onMenuClicked(info) {
  CONTEXT_MENU[info.menuItemId]
    ?.callback()
    .catch((error) => console.warn("Context menu action failed", error));
}

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    for (const [menuItemId, menuItem] of Object.entries(CONTEXT_MENU)) {
      chrome.contextMenus.create({
        contexts: ["action"],
        id: menuItemId,
        title: menuItem.title,
      });
    }
  });
}

function onMessage(message, _sender, sendResponse) {
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
  return true;
}

async function handleMessage(message) {
  if (message?.type === "get-hints" || message?.type === "refresh-hints") {
    const rows = await getHintRows();
    return { ok: true, rows };
  }

  if (message?.type === "activate-label") {
    return await activateLabel(message.label);
  }

  throw new Error(`Unknown message type: ${message?.type}`);
}

async function activateLabel(label) {
  const normalizedLabel = String(label ?? "").toLowerCase();
  const rows = await getHintRows();
  const target = rows.find((row) => row.label === normalizedLabel);

  if (!target) {
    return { ok: false, error: `No tab for label ${normalizedLabel}` };
  }

  await chrome.tabs.update(target.tabId, { active: true });

  return { ok: true, target };
}
