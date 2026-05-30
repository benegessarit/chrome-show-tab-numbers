import { buildHintRows } from "./lib/labels.js";

const config = { enabled: true, disabledTabIds: new Set() };

const COMMANDS = {
  "refresh-hints": updateAll,
  "toggle-hints": toggleAllHints,
};

const CONTEXT_MENU = {
  "tab-flash-refresh-hints": {
    title: "Refresh tab jump hints",
    callback: updateAll,
  },
  "tab-flash-toggle-hints": {
    title: "Toggle tab jump hints",
    callback: toggleAllHints,
  },
  "tab-flash-toggle-current-tab": {
    title: "Toggle hints for current tab",
    callback: toggleCurrentTab,
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
chrome.tabs.onRemoved.addListener(onTabRemoved);
chrome.commands.onCommand.addListener(onCommand);
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

  await Promise.allSettled(
    rows.map((row) => updateTabHint(row, { enabled: config.enabled })),
  );
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

async function updateTabHint(row, { enabled }) {
  if (!row.injectable || config.disabledTabIds.has(row.tabId)) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: row.tabId },
      func: updatePageHint,
      args: [
        {
          active: row.active,
          enabled,
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

function updatePageHint({ active, enabled, label, title }) {
  const FLASH_PREFIX_PATTERN = /^[◆◇]\s*[A-Z;]{1,4}\s*[◆◇]\s*/;
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

  function restoreFavicon(cache) {
    const icon = document.querySelector('link[rel~="icon"]');

    if (!icon || !cache.originalFaviconCaptured) {
      return;
    }

    if (cache.originalFaviconHref) {
      icon.setAttribute("href", cache.originalFaviconHref);
    } else if (cache.createdFavicon) {
      icon.remove();
      return;
    }

    if (cache.originalFaviconType) {
      icon.setAttribute("type", cache.originalFaviconType);
    } else {
      icon.removeAttribute("type");
    }
  }

  const cache = document.tabFlashJumpHints ?? {};
  const rawTitle = title || document.title || "Untitled tab";
  const baseTitle =
    cache.renderedTitle === rawTitle && cache.baseTitle
      ? cache.baseTitle
      : rawTitle
          .replace(FLASH_PREFIX_PATTERN, "")
          .replace(NUMBERED_PATTERN, "")
          .replace(NOTIFICATION_COUNT_PATTERN, "$1 ")
          .trim();

  const marker = active ? "◆" : "◇";
  const renderedTitle = enabled
    ? `${marker} ${label.toUpperCase()} ${marker} ${baseTitle}`.trim()
    : baseTitle;

  if (document.title !== renderedTitle) {
    document.title = renderedTitle;
  }

  if (enabled) {
    setFaviconBadge(cache, label, { isActive: active });
  } else {
    restoreFavicon(cache);
  }

  cache.active = active;
  cache.baseTitle = baseTitle;
  cache.enabled = enabled;
  cache.label = label;
  cache.renderedTitle = renderedTitle;
  document.tabFlashJumpHints = cache;
}

async function toggleAllHints() {
  config.enabled = !config.enabled;
  await updateAll();
}

async function toggleCurrentTab() {
  const [currentTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  if (!currentTab?.id) {
    return;
  }

  const isDisabled = config.disabledTabIds.has(currentTab.id);

  if (isDisabled) {
    config.disabledTabIds.delete(currentTab.id);
  } else {
    config.disabledTabIds.add(currentTab.id);
  }

  await updateAll();
}

function onTabRemoved(tabId) {
  config.disabledTabIds.delete(tabId);
}

function onCommand(command) {
  const callback = COMMANDS[command];

  if (callback) {
    callback().catch((error) =>
      console.warn(`Command failed: ${command}`, error),
    );
  }
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
    return { enabled: config.enabled, ok: true, rows };
  }

  if (message?.type === "refresh-hints") {
    await updateAll();
    const rows = await getHintRows();
    return { enabled: config.enabled, ok: true, rows };
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
