-- Tab Flash Jump Hints Hammerspoon loader.
-- Copy or symlink this file to ~/.hammerspoon/init.lua, then reload Hammerspoon.

hs.ipc.cliInstall()
hs.accessibilityState(true)
hs.allowAppleScript(true)

package.path = "/Users/davidbeyer/chromeextension/tab-jump-hints/hammerspoon/?.lua;" .. package.path

local tabJumpHints = require("chrome-tab-jump-hints")
tabJumpHints.start()

hs.notify.new({
  title = "Tab Jump Hints",
  informativeText = "Chrome left-Ctrl overlay loaded",
}):send()
