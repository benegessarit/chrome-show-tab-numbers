# Tab Flash Jump Hints

A local, unpacked Chrome extension plus a small macOS helper for transient tab-jump labels.

This is adapted from [`kg8m/chrome-show-tab-numbers`](https://github.com/kg8m/chrome-show-tab-numbers) under the MIT license. The original extension numbers tabs by rewriting page titles. This fork keeps tab titles clean by default and uses a local helper + Karabiner for temporary Ctrl-held hints.

## What it does

- Keeps Chrome tab titles clean by default. The extension no longer refreshes always-on title/favicon prefixes at startup or on tab events.
- Preserves the shared label order: `a s d f j k l ; q w e r u i o p z x c v b n m g h y t`.
- Adds a local helper command: `/Users/davidbeyer/.local/bin/chrome-tab-prefix-jump doctor|show|hide|jump <label>`.
- Uses one-key Ctrl-hold hints for the pilot: hold physical left Ctrl in real Google Chrome (`com.google.Chrome`) to show `[A]`, `[S]`, `[D]`, etc.; tap the visible one-key label to jump; release Ctrl or complete a jump to restore clean titles.
- Keeps the extension popup as the fallback for overflow/two-key labels such as `aa`, restricted pages, and helper setup problems.
- Skips restricted pages (`chrome://`, Chrome Web Store, extension pages) before consuming visible letters, so restricted tabs do not steal `[A]` or `[;]`.

## Chrome setup gate

The helper shows/hides labels by asking Chrome to run a tiny JavaScript snippet in each normal page. Chrome must allow JavaScript from Apple Events.

Run:

```bash
chrome-tab-prefix-jump doctor
```

If Chrome blocks it, the helper prints exactly:

```text
Chrome is blocking JavaScript from Apple Events. In Chrome, use View > Developer > Allow JavaScript from Apple Events, then rerun chrome-tab-prefix-jump doctor.
```

Do that in Chrome, then rerun `chrome-tab-prefix-jump doctor`. If you do not want to enable that Chrome setting, skip this helper and use the popup fallback or build a native overlay later.

## Install locally

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:

   ```text
   /Users/davidbeyer/chromeextension/tab-jump-hints
   ```

5. Install the helper and Karabiner rule from this repo state:

   ```bash
   /Users/davidbeyer/.local/bin/chrome-tab-prefix-jump doctor
   ```

6. Open a few normal `https://` tabs in Google Chrome.
7. Hold physical left Ctrl. Temporary labels should appear in titles/favicons.
8. Tap a visible one-key label, for example Ctrl+A or Ctrl+S, to jump and restore titles.
9. Release Ctrl to hide without jumping.
10. Optional popup fallback: press `⌘⇧J` or click the extension icon.

If `⌘⇧J` conflicts with another extension, open `chrome://extensions/shortcuts` and remap **Tab Flash Jump Hints**. The shortcut is optional; the Ctrl-hold path is handled by Karabiner and the local helper.

## Ctrl-hold pilot limits

- Only one-key labels are mapped through Karabiner. Tabs beyond the one-key alphabet get two-key labels in the popup, not Ctrl chords.
- Physical left Ctrl is intentionally exact. Hyper/Caps chords should not match because the Karabiner jump manipulators require `mandatory: ["left_control"]` and do not allow `optional: ["any"]`.
- While Chrome is frontmost, Ctrl+label keys are tab jumps instead of normal Chrome/text-editing shortcuts. If that is annoying, change the hold key later or remove the rule.
- The helper targets the real Chrome bundle id `com.google.Chrome`, not Chrome for Testing or another Chromium app.

## Change the hold key later

Edit the single Karabiner rule named `Chrome transient tab prefix hints (exact left Ctrl)` in:

```text
/Users/davidbeyer/.config/karabiner/karabiner.json
```

Change the show/hide manipulator `from.key_code` and the jump manipulators' mandatory modifier together. Then run:

```bash
python3 -m json.tool /Users/davidbeyer/.config/karabiner/karabiner.json >/tmp/karabiner.json.pretty
"/Library/Application Support/org.pqrs/Karabiner-Elements/bin/karabiner_cli" --lint-complex-modifications /Users/davidbeyer/.config/karabiner/karabiner.json
```

## Rollback

- Restore the timestamped backup next to `/Users/davidbeyer/.config/karabiner/karabiner.json`, or remove only the rule named `Chrome transient tab prefix hints (exact left Ctrl)`.
- Remove `/Users/davidbeyer/.local/bin/chrome-tab-prefix-jump` if you do not want the helper.
- Remove `/Users/davidbeyer/.local/state/chrome-tab-prefix-jump/` if you want to clear stale helper state/logs; the helper recreates it on the next run.
- Reload or remove the unpacked extension from `chrome://extensions`.
- If you enabled Chrome JavaScript from Apple Events only for this pilot, turn it back off from Chrome's Developer menu.

## Develop / verify

```bash
npm install
npm run check
```

`npm run check` runs:

- ESLint across the extension and helper source;
- Prettier format check;
- label-generation, hidden-by-default background, and helper state tests; and
- a small manifest validator for local MV3 loading.

## Manual smoke checklist

- [ ] Load or reload the unpacked extension from `/Users/davidbeyer/chromeextension/tab-jump-hints`.
- [ ] Run `chrome-tab-prefix-jump doctor` and handle the Chrome setup gate if needed.
- [ ] Open 8+ tabs in one Chrome window.
- [ ] Include one restricted page such as `chrome://extensions`.
- [ ] Confirm titles are clean before holding Ctrl.
- [ ] Hold physical left Ctrl and confirm normal web tabs show temporary title prefixes like `[A] Inbox` plus favicon letter badges.
- [ ] Confirm restricted pages do not consume visible prefix letters.
- [ ] Release Ctrl and confirm titles are clean again.
- [ ] Hold Ctrl and tap a visible one-key label; confirm Chrome activates that tab and restores clean titles.
- [ ] Press `⌘⇧J`, confirm the popup lists labels in home-row order, and activate an overflow/two-key tab from it.
