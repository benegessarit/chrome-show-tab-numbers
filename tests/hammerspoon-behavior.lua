local M = dofile("hammerspoon/chrome-tab-jump-hints.lua")

assert(M.CHROME_BUNDLE_ID == "com.google.Chrome")
assert(M.HYPER_TRIGGER_KEY_CODE == M.KEY_CODES.k)
assert(M.KARABINER_TRIGGER_KEY_CODE == 79)
assert(M.isHyperFlags({ ctrl = true, alt = true, shift = true, cmd = true }) == true)
assert(M.isPlainFlags({}) == true)
assert(M.isModalTrigger({
  getKeyCode = function() return M.KARABINER_TRIGGER_KEY_CODE end,
  getFlags = function() return {} end,
}) == true)
assert(M.KEY_CODE_LABELS[0] == "a")
assert(M.KEY_CODE_LABELS[41] == ";")

local rows = M.buildRows({
  { index = 0, title = "First", url = "https://first.example", active = true },
  { index = 1, title = "Second", url = "chrome://extensions", active = false },
  { tabIndex = 4, title = "Fourth", url = "https://fourth.example", active = false },
})

assert(#rows == 3)
assert(rows[1].label == "a" and rows[1].tabIndex == 1 and rows[1].active == true)
assert(rows[2].label == "s" and rows[2].tabIndex == 2)
assert(rows[3].label == "d" and rows[3].tabIndex == 4)

local layout = M.layoutRows({ x = 10, y = 20, w = 900, h = 52 }, rows)
assert(#layout == 3)
assert(layout[1].label == "a" and layout[1].x < layout[2].x)
assert(layout[2].x < layout[3].x)
assert(layout[1].w == M.LABEL_WIDTH and layout[1].h == M.LABEL_HEIGHT)

local fakeOverlay = { shown = false, hidden = false, replaced = 0 }
function fakeOverlay:level(_level) return self end
function fakeOverlay:behaviorAsLabels(_labels) return self end
function fakeOverlay:clickActivating(_flag) return self end
function fakeOverlay:frame(frame) self.lastFrame = frame return self end
function fakeOverlay:replaceElements(...) self.replaced = select("#", ...) return self end
function fakeOverlay:show(delay) self.shown = delay == 0 return self end
function fakeOverlay:hide(delay) self.hidden = delay == 0 return self end
function fakeOverlay:delete(_delay) self.deleted = true return self end

local fakeWindow = {}
function fakeWindow:frame() return { x = 0, y = 0, w = 900, h = 600 } end
function fakeWindow:application() return { bundleID = function() return M.CHROME_BUNDLE_ID end } end
function fakeWindow:focusTab(_index) return false end

local activated = {}
local fakeEnv = {
  now = function() return 10 end,
  queryChromeTabs = function()
    return {
      { index = 0, title = "First", active = true },
      { index = 1, title = "Second", active = false },
    }
  end,
  setChromeTabIndex = function(_env, tabIndex)
    activated[#activated + 1] = tabIndex
    return true
  end,
}

fakeEnv.hs = {
  application = {
    frontmostApplication = function()
      return { bundleID = function() return M.CHROME_BUNDLE_ID end }
    end,
    get = function() return { mainWindow = function() return fakeWindow end } end,
    applicationsForBundleID = function() return {} end,
  },
  window = { frontmostWindow = function() return fakeWindow end },
  canvas = {
    windowLevels = { overlay = 99 },
    new = function(frame)
      fakeOverlay.lastFrame = frame
      return fakeOverlay
    end,
  },
  timer = {
    doAfter = function(delay, fn)
      return { delay = delay, fn = fn, stop = function(self) self.stopped = true end }
    end,
    doEvery = function(_interval, _fn)
      return { stop = function() end }
    end,
  },
  eventtap = {
    event = { types = { flagsChanged = 12, keyDown = 10 } },
    new = function(_types, callback)
      return { start = function(self) self.callback = callback return self end, stop = function() end }
    end,
  },
}

local controller = M.create(fakeEnv):start()
assert(#controller.cache.rows == 2)
assert(fakeOverlay.lastFrame ~= nil)
assert(fakeOverlay.shown == false)
assert(controller:handleKeyDown({
  getKeyCode = function() return M.HYPER_TRIGGER_KEY_CODE end,
  getFlags = function() return { ctrl = true, alt = true, shift = true, cmd = true } end,
}) == true)
assert(fakeOverlay.shown == true)
assert(fakeOverlay.replaced == 4)
assert(controller.modalActive == true)
assert(controller:handleKeyDown({
  getKeyCode = function() return M.KEY_CODES.s end,
  getFlags = function() return {} end,
}) == true)
assert(activated[1] == 2)
assert(fakeOverlay.hidden == true)
controller:stop()

print("ok - Hammerspoon row and layout behavior")
