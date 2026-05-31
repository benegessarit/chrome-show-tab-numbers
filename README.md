# Tab Flash Jump Hints

A local, unpacked Chrome extension plus a resident Hammerspoon helper for transient tab-jump labels.

This is adapted from [`kg8m/chrome-show-tab-numbers`](https://github.com/kg8m/chrome-show-tab-numbers) under the MIT license. The original extension numbers tabs by rewriting page titles. This fork keeps tab titles clean by default and uses a resident Hammerspoon overlay for temporary Ctrl-held hints.

## What it does

- Keeps Chrome tab titles clean by default. The extension no longer refreshes always-on title/favicon prefixes at startup or on tab events.
- Preserves the shared label order: `a s d f j k l ; q w e r u i o p z x c v b n m g h y t`.
- Adds a resident Hammerspoon overlay: hold physical left Ctrl in real Google Chrome (`com.google.Chrome`) to show `[A]`, `[S]`, `[D]`, etc. near the tab strip with no title rewrite delay.
- Tapping the visible one-key label while still holding left Ctrl jumps to that tab and hides the overlay.
- Keeps the legacy local helper command available for diagnosis: `/Users/davidbeyer/.local/bin/chrome-tab-prefix-jump doctor|show|hide|jump <label>`.
- Keeps the extension popup as the fallback for overflow/two-key labels such as `aa` and extension helper setup problems.
- Includes restricted pages (`chrome://`, Chrome Web Store, extension pages) in the Hammerspoon overlay because it no longer depends on injecting JavaScript into the page.

## Chrome setup gate

The Hammerspoon path only asks Chrome for the tab list and active tab index. It does **not** rewrite page titles/favicons and does not need Chrome's “Allow JavaScript from Apple Events” setting for normal use.

The legacy CLI helper still rewrites page titles/favicons for fallback diagnosis. If you use that helper directly, Chrome must allow JavaScript from Apple Events.

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

5. Install the Hammerspoon loader from this repo state:

   ```bash
   cp /Users/davidbeyer/chromeextension/tab-jump-hints/hammerspoon/init.lua /Users/davidbeyer/.hammerspoon/init.lua
   open -a Hammerspoon
   ```

6. Open a few normal `https://` tabs in Google Chrome.
7. Hold physical left Ctrl. Temporary labels should appear near the tab strip almost immediately.
8. Tap a visible one-key label, for example Ctrl+A or Ctrl+S, to jump and restore titles.
9. Release Ctrl to hide without jumping.
10. Optional popup fallback: press `⌘⇧J` or click the extension icon.

If `⌘⇧J` conflicts with another extension, open `chrome://extensions/shortcuts` and remap **Tab Flash Jump Hints**. The shortcut is optional; the Ctrl-hold path is handled by Hammerspoon.

## Ctrl-hold pilot limits

- Only one-key labels are mapped through the resident Hammerspoon overlay. Tabs beyond the one-key alphabet get two-key labels in the popup, not Ctrl chords.
- Physical left Ctrl is intentionally exact. Hammerspoon watches left-control key code `59`, so right Ctrl and Hyper/Caps chords should not match.
- While Chrome is frontmost, Ctrl+label keys are tab jumps instead of normal Chrome/text-editing shortcuts. If that is annoying, change the hold key later or remove the rule.
- The helper targets the real Chrome bundle id `com.google.Chrome`, not Chrome for Testing or another Chromium app.

## Change the hold key later

Edit the Hammerspoon module in:

```text
/Users/davidbeyer/chromeextension/tab-jump-hints/hammerspoon/chrome-tab-jump-hints.lua
```

Change `LEFT_CONTROL_KEY_CODE` plus the keydown gates together. Then run:

```bash
npm run check
osascript -e 'tell application "Hammerspoon" to quit'
open -a Hammerspoon
```

## Rollback

- Restore the prior `/Users/davidbeyer/.hammerspoon/init.lua` backup if one was created, or remove the `tabJumpHints.start()` loader.
- If needed, restore the timestamped backup next to `/Users/davidbeyer/.config/karabiner/karabiner.json`, or keep the old rule named `Chrome transient tab prefix hints (exact left Ctrl)` removed so it does not race Hammerspoon.
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
- [ ] Confirm Hammerspoon is running and loaded `/Users/davidbeyer/.hammerspoon/init.lua`.
- [ ] Open 8+ tabs in one Chrome window.
- [ ] Include one restricted page such as `chrome://extensions`.
- [ ] Confirm titles are clean before holding Ctrl.
- [ ] Hold physical left Ctrl and confirm overlay labels appear near the tab strip almost immediately.
- [ ] Confirm restricted pages can be jumped to by overlay label, since Hammerspoon no longer depends on page injection.
- [ ] Release Ctrl and confirm titles are clean again.
- [ ] Hold Ctrl and tap a visible one-key label; confirm Chrome activates that tab and restores clean titles.
- [ ] Press `⌘⇧J`, confirm the popup lists labels in home-row order, and activate an overflow/two-key tab from it.
