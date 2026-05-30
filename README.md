# Tab Flash Jump Hints

A local, unpacked Chromium extension for fast tab switching with nvim-Flash-style home-row labels.

This is adapted from [`kg8m/chrome-show-tab-numbers`](https://github.com/kg8m/chrome-show-tab-numbers) under the MIT license. The original extension numbers tabs by rewriting page titles. This fork changes the product loop: tabs get prominent letter labels, favicon badges, and a keyboard-focused popup for jumping.

## What it does

- Labels current-window tabs with home-row-first letters: `a s d f j k l ; q w e r u i o p z x c v b n m g h y t`.
- Falls back to two-key labels after the one-key alphabet, e.g. `aa`, `as`, `ad`.
- Makes hints more visible than title text alone by rewriting both:
  - the tab title prefix, e.g. `◆ A ◆ Inbox`; and
  - the page favicon to a high-contrast letter badge when the page allows injection.
- Opens a popup with `⌘⇧J` on macOS. Type the visible label or click the row to activate a tab.
- Skips collapsed tab groups when assigning visible labels, following the upstream behavior.
- Handles restricted pages gracefully: `chrome://` and Web Store tabs still appear in the popup list, but cannot receive title/favicon injection.

## Important limitation

A pure Chrome extension cannot draw a large overlay on Chrome's native tab strip or listen for raw “hold Cmd, release Cmd” events. Chrome’s supported extension surfaces are command shortcuts, tab activation, page script/CSS injection, title/favicons, and extension popups.

If this MVP feels useful, the true “hold Cmd and show native tab-strip overlays” version should be a separate macOS helper/Hammerspoon/Accessibility build.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:

   ```text
   /Users/davidbeyer/chromeextension/tab-jump-hints
   ```

5. Open a few normal `https://` tabs.
6. Press `⌘⇧J` or click the extension icon.
7. Type a shown label, e.g. `a`, `s`, `d`, or `;`.

If `⌘⇧J` conflicts with another extension, open `chrome://extensions/shortcuts` and remap **Tab Flash Jump Hints**.

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

- [ ] Load the unpacked extension from `/Users/davidbeyer/chromeextension/tab-jump-hints`.
- [ ] Open 8+ tabs in one Chrome window.
- [ ] Include one restricted page such as `chrome://extensions`.
- [ ] Press `⌘⇧J`.
- [ ] Confirm the popup lists letter labels in home-row order.
- [ ] Press a label and confirm the matching tab activates.
- [ ] Confirm normal web tabs show visible title prefixes and favicon letter badges.
- [ ] Confirm restricted pages do not crash and remain available via the popup.
