import { buildHintRows } from "./lib/labels.js";

const CONTEXT_MENU = {
  "tab-prefix-refresh-hints": {
    title: "Refresh visible tab prefixes",
    callback: updateAll,
  },
};

let timer = -1;

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
  requestToUpdateAll();
});
chrome.runtime.onStartup.addListener(requestToUpdateAll);
chrome.storage.onChanged.addListener(requestToUpdateAll);
chrome.tabGroups.onCreated.addListener(requestToUpdateAll);
chrome.tabGroups.onMoved.addListener(requestToUpdateAll);
chrome.tabGroups.onRemoved.addListener(requestToUpdateAll);
chrome.tabGroups.onUpdated.addListener(requestToUpdateAll);
chrome.tabs.onActivated.addListener(requestToUpdateAll);
chrome.tabs.onCreated.addListener(requestToUpdateAll);
chrome.tabs.onMoved.addListener(requestToUpdateAll);
chrome.tabs.onRemoved.addListener(requestToUpdateAll);
chrome.tabs.onUpdated.addListener(requestToUpdateAll);
chrome.contextMenus.onClicked.addListener(onMenuClicked);
chrome.runtime.onMessage.addListener(onMessage);

createContextMenu();
requestToUpdateAll();

function requestToUpdateAll() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    updateAll().catch((error) =>
      console.warn("tab hint refresh failed", error),
    );
  }, 150);
}

async function updateAll() {
  const rows = await getHintRows();

  await Promise.allSettled(rows.map((row) => updateTabHint(row)));
}

async function getHintRows() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const collapsedTabGroups = await findCollapsedTabGroups();
  const collapsedTabGroupIds = new Set(
    collapsedTabGroups.map((tabGroup) => tabGroup.id),
  );

  return buildHintRows(tabs, { collapsedTabGroupIds });
}

async function findCollapsedTabGroups() {
  try {
    return await chrome.tabGroups.query({
      windowId: chrome.windows.WINDOW_ID_CURRENT,
      collapsed: true,
    });
  } catch (error) {
    if (error.message?.includes("Grouping is not supported by tabs")) {
      return [];
    }

    console.warn("Could not query collapsed tab groups", error);
    return [];
  }
}

async function updateTabHint(row) {
  if (!row.injectable) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: row.tabId },
      func: updatePageHint,
      args: [
        {
          active: row.active,
          label: row.label,
          title: row.title,
        },
      ],
    });
  } catch (error) {
    // Restricted pages, discarded tabs, and pages mid-navigation can reject injection.
    // The popup still provides a graceful jump-list fallback for those tabs.
    console.debug("Skipping tab hint injection", row.tabId, error.message);
  }
}

function updatePageHint({ active, label, title }) {
  const TAB_PREFIX_PATTERN =
    /^(?:[◆◇]\s*[A-Z;]{1,4}\s*[◆◇]|\[[A-Z;]{1,4}\])\s*/;
  const NUMBERED_PATTERN = /^[-+]?\d+\. ?/;
  const NOTIFICATION_COUNT_PATTERN = /^(\(\d+\)) [-+]?\d+\. (?:\(\d+\) )?/;

  function buildBadgeDataUrl(currentLabel, { isActive }) {
    const safeLabel = currentLabel.toUpperCase().replace(/[<&>]/g, "");
    const background = isActive ? "#F4C542" : "#111827";
    const foreground = isActive ? "#111827" : "#F9FAFB";
    const ring = isActive ? "#111827" : "#F4C542";
    const fontSize = safeLabel.length > 1 ? 34 : 42;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        <rect width="64" height="64" rx="14" fill="${background}"/>
        <rect x="4" y="4" width="56" height="56" rx="11" fill="none" stroke="${ring}" stroke-width="5"/>
        <text x="32" y="43" text-anchor="middle" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="${fontSize}" font-weight="900" fill="${foreground}">${safeLabel}</text>
      </svg>`;

    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  function findOrCreateFavicon(cache) {
    const existingIcon = document.querySelector('link[rel~="icon"]');

    if (existingIcon) {
      return existingIcon;
    }

    const icon = document.createElement("link");
    icon.setAttribute("rel", "icon");
    icon.setAttribute("data-tab-flash-jump-hints", "true");
    (document.head || document.documentElement).append(icon);
    cache.createdFavicon = true;
    return icon;
  }

  function setFaviconBadge(cache, currentLabel, { isActive }) {
    const icon = findOrCreateFavicon(cache);

    if (!cache.originalFaviconCaptured) {
      cache.originalFaviconCaptured = true;
      cache.originalFaviconHref = icon.getAttribute("href") || "";
      cache.originalFaviconType = icon.getAttribute("type") || "";
    }

    icon.setAttribute("type", "image/svg+xml");
    icon.setAttribute("href", buildBadgeDataUrl(currentLabel, { isActive }));
  }

  const cache = document.tabFlashJumpHints ?? {};
  const rawTitle = title || document.title || "Untitled tab";
  const baseTitle =
    cache.renderedTitle === rawTitle && cache.baseTitle
      ? cache.baseTitle
      : rawTitle
          .replace(TAB_PREFIX_PATTERN, "")
          .replace(NUMBERED_PATTERN, "")
          .replace(NOTIFICATION_COUNT_PATTERN, "$1 ")
          .trim();

  const renderedTitle = `[${label.toUpperCase()}] ${baseTitle}`.trim();

  if (document.title !== renderedTitle) {
    document.title = renderedTitle;
  }

  setFaviconBadge(cache, label, { isActive: active });

  cache.active = active;
  cache.baseTitle = baseTitle;
  cache.label = label;
  cache.renderedTitle = renderedTitle;
  document.tabFlashJumpHints = cache;
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
  if (message?.type === "get-hints") {
    const rows = await getHintRows();
    return { ok: true, rows };
  }

  if (message?.type === "refresh-hints") {
    await updateAll();
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
  requestToUpdateAll();

  return { ok: true, target };
}
