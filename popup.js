import { LABEL_ALPHABET } from "./lib/labels.js";

const tabsList = document.querySelector("#tabs");
const statusEl = document.querySelector("#status");
const bufferEl = document.querySelector("#buffer");
const refreshButton = document.querySelector("#refresh");
const validKeys = new Set(LABEL_ALPHABET);

let rows = [];
let inputBuffer = "";
let pendingActivationTimer = -1;

refreshButton.addEventListener("click", refreshHints);
document.addEventListener("keydown", onKeyDown);

await refreshHints();

async function refreshHints() {
  setStatus("Refreshing hints…");
  const response = await chrome.runtime.sendMessage({ type: "refresh-hints" });

  if (!response?.ok) {
    setStatus(response?.error || "Could not load tab hints.");
    return;
  }

  rows = response.rows;
  renderRows(rows);
  setStatus(rows.length ? "" : "No visible current-window tabs found.");
}

function renderRows(tabRows) {
  tabsList.textContent = "";

  for (const row of tabRows) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "tab-row";
    button.type = "button";
    button.dataset.label = row.label;
    button.setAttribute("aria-current", String(row.active));

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = row.label;

    const body = document.createElement("span");
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = row.title || "Untitled tab";

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.append(buildPill(row.active ? "active" : `tab ${row.tabId}`));

    if (row.pinned) {
      meta.append(buildPill("pinned"));
    }

    if (!row.injectable) {
      meta.append(buildPill("popup-only"));
    }

    body.append(title, meta);
    button.append(label, body);
    button.addEventListener("click", () => activateLabel(row.label));
    item.append(button);
    tabsList.append(item);
  }
}

function buildPill(text) {
  const pill = document.createElement("span");
  pill.className = "pill";
  pill.textContent = text;
  return pill;
}

function onKeyDown(event) {
  if (event.key === "Escape") {
    resetBuffer();
    return;
  }

  const key = event.key.toLowerCase();

  if (!validKeys.has(key)) {
    return;
  }

  event.preventDefault();
  appendToBuffer(key);
}

function appendToBuffer(key) {
  clearTimeout(pendingActivationTimer);
  inputBuffer += key;
  bufferEl.textContent = inputBuffer;

  let matches = rows.filter((row) => row.label.startsWith(inputBuffer));

  if (matches.length === 0) {
    inputBuffer = key;
    bufferEl.textContent = inputBuffer;
    matches = rows.filter((row) => row.label.startsWith(inputBuffer));
  }

  const exactMatch = rows.find((row) => row.label === inputBuffer);
  const hasLongerMatch = matches.some(
    (row) => row.label.length > inputBuffer.length,
  );

  if (exactMatch && !hasLongerMatch) {
    activateLabel(exactMatch.label);
    return;
  }

  if (exactMatch && hasLongerMatch) {
    pendingActivationTimer = setTimeout(
      () => activateLabel(exactMatch.label),
      450,
    );
    return;
  }

  if (matches.length === 1 && matches[0].label === inputBuffer) {
    activateLabel(matches[0].label);
  }
}

async function activateLabel(label) {
  clearTimeout(pendingActivationTimer);
  bufferEl.textContent = label;
  const response = await chrome.runtime.sendMessage({
    type: "activate-label",
    label,
  });

  if (!response?.ok) {
    setStatus(response?.error || `Could not activate ${label}.`);
    resetBuffer();
    return;
  }

  window.close();
}

function resetBuffer() {
  clearTimeout(pendingActivationTimer);
  inputBuffer = "";
  bufferEl.textContent = "";
}

function setStatus(message) {
  statusEl.textContent = message;
  statusEl.hidden = !message;
}
