export const LABEL_ALPHABET = [
  "a",
  "s",
  "d",
  "f",
  "j",
  "k",
  "l",
  ";",
  "q",
  "w",
  "e",
  "r",
  "u",
  "i",
  "o",
  "p",
  "z",
  "x",
  "c",
  "v",
  "b",
  "n",
  "m",
  "g",
  "h",
  "y",
  "t",
];

const VALID_PROTOCOLS = new Set(["https:", "http:"]);
const INVALID_HOSTNAMES = new Set([
  "chrome.google.com",
  "chromewebstore.google.com",
]);

const FLASH_PREFIX_PATTERN = /^[◆◇]\s*[A-Z;]{1,4}\s*[◆◇]\s*/;
const NUMBERED_PATTERN = /^[-+]?\d+\. ?/;
const NOTIFICATION_COUNT_PATTERN = /^(\(\d+\)) [-+]?\d+\. (?:\(\d+\) )?/;

export function labelForIndex(index, alphabet = LABEL_ALPHABET) {
  if (!Number.isInteger(index) || index < 0) {
    throw new TypeError("index must be a non-negative integer");
  }

  if (!Array.isArray(alphabet) || alphabet.length === 0) {
    throw new TypeError("alphabet must be a non-empty array");
  }

  let remainder = index;
  let label = "";

  do {
    label = alphabet[remainder % alphabet.length] + label;
    remainder = Math.floor(remainder / alphabet.length) - 1;
  } while (remainder >= 0);

  return label;
}

export function isInjectableUrl(urlString) {
  if (!urlString) {
    return false;
  }

  try {
    const url = new URL(urlString);
    return (
      VALID_PROTOCOLS.has(url.protocol) && !INVALID_HOSTNAMES.has(url.hostname)
    );
  } catch {
    return false;
  }
}

export function stripHintPrefix(title) {
  return String(title ?? "")
    .replace(FLASH_PREFIX_PATTERN, "")
    .replace(NUMBERED_PATTERN, "")
    .replace(NOTIFICATION_COUNT_PATTERN, "$1 ")
    .trim();
}

export function buildHintRows(tabs, { collapsedTabGroupIds = new Set() } = {}) {
  let labelIndex = 0;

  return [...tabs]
    .sort((tab1, tab2) => tab1.index - tab2.index)
    .flatMap((tab) => {
      if (collapsedTabGroupIds.has(tab.groupId)) {
        return [];
      }

      const label = labelForIndex(labelIndex);
      labelIndex += 1;

      return [
        {
          active: Boolean(tab.active),
          audible: Boolean(tab.audible),
          discarded: Boolean(tab.discarded),
          favIconUrl: tab.favIconUrl ?? "",
          groupId: tab.groupId,
          highlighted: Boolean(tab.highlighted),
          injectable: isInjectableUrl(tab.url),
          label,
          pinned: Boolean(tab.pinned),
          tabId: tab.id,
          title: stripHintPrefix(tab.title || tab.url || "Untitled tab"),
          url: tab.url ?? "",
          windowId: tab.windowId,
        },
      ];
    });
}
