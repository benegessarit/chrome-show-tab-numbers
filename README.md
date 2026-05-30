# Tab Flash Jump Hints

A local, unpacked Chromium extension for testing whether always-on, visible home-row prefixes make Chrome tabs easier to scan.

This is adapted from [`kg8m/chrome-show-tab-numbers`](https://github.com/kg8m/chrome-show-tab-numbers) under the MIT license. The original extension numbers tabs by rewriting page titles. This fork keeps prominent letter prefixes visible all the time.

## What it does

- Labels current-window tabs with always-on home-row-first prefixes: `a s d f j k l ; q w e r u i o p z x c v b n m g h y t`.
- Renders title prefixes as bracketed uppercase labels, e.g. `[A] Inbox` and `[;] Docs`.
- Falls back to two-key labels after the one-key alphabet, e.g. `[AA]`, `[AS]`, `[AD]`.
- Adds a high-contrast favicon badge when the page allows injection, so the label is visible even when the tab title is narrow.
- Refreshes prefixes automatically as tabs open, close, move, activate, update, or move in/out of tab groups.
- Keeps the popup only as an optional helper list / jump affordance. The MVP test is the always-on prefixes, not a command-hold overlay.
- Skips restricted pages (`chrome://`, Web Store, extension pages) gracefully because Chrome blocks title/favicon injection there.

## Important limitation

A pure Chrome extension cannot draw a large overlay on Chrome's native tab strip or listen for raw “hold Cmd, release Cmd” events. This MVP intentionally avoids that path. If the always-on prefixes feel useful, the true “hold Cmd and show native tab-strip overlays” version should be a separate macOS helper/Hammerspoon/Accessibility build.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:

   ```text
   /Users/davidbeyer/chromeextension/tab-jump-hints
   ```

5. Open a few normal `https://` tabs.
6. Confirm the tabs now show visible prefixes such as `[A]`, `[S]`, `[D]`.
7. Optional: press `⌘⇧J` or click the extension icon to see the helper list / jump popup.

If `⌘⇧J` conflicts with another extension, open `chrome://extensions/shortcuts` and remap **Tab Flash Jump Hints**. The shortcut is optional; prefixes are always on.

## Develop / verify

```bash
npm install
npm run check
```

`npm run check` runs:

- ESLint across the extension source;
- Prettier format check;
- label-generation tests; and
- a small manifest validator for local MV3 loading.

## Manual smoke checklist

- [ ] Load or reload the unpacked extension from `/Users/davidbeyer/chromeextension/tab-jump-hints`.
- [ ] Open 8+ tabs in one Chrome window.
- [ ] Include one restricted page such as `chrome://extensions`.
- [ ] Confirm normal web tabs show visible title prefixes like `[A] Inbox` plus favicon letter badges.
- [ ] Confirm the prefixes stay visible without holding any key or opening the popup.
- [ ] Move/activate/create/close a tab and confirm prefixes refresh in tab order.
- [ ] Optional: press `⌘⇧J`, confirm the popup lists letter labels in home-row order, and activate one tab from it.
- [ ] Confirm restricted pages do not crash and do not consume visible prefix letters.
