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
assert(M.REFRESH_INTERVAL_SECONDS == 0.5 and M.CACHE_STALE_SECONDS == 1.0)
assert(M.LABEL_WIDTH == 16 and M.LABEL_HEIGHT == 14 and M.LABEL_TEXT_SIZE == 10)
assert(layout[1].y == M.LABEL_TOP)
local usableWidth = math.max(M.MIN_USABLE_TAB_STRIP_WIDTH, 900 - M.TAB_STRIP_LEFT_INSET - M.TAB_STRIP_RIGHT_INSET)
local tabWidth = math.min(M.MAX_TAB_WIDTH, math.max(M.MIN_TAB_WIDTH, usableWidth / #rows))
local centeredFirstX = M.TAB_STRIP_LEFT_INSET + ((tabWidth - M.LABEL_WIDTH) / 2)
local function rounded(value)
  return math.floor(value + 0.5)
end
assert(layout[1].x == rounded(centeredFirstX))
assert(layout[2].x == rounded(M.TAB_STRIP_LEFT_INSET + tabWidth + ((tabWidth - M.LABEL_WIDTH) / 2)))
for index, row in ipairs(layout) do
  local expectedCenter = M.TAB_STRIP_LEFT_INSET + ((index - 1) * tabWidth) + (tabWidth / 2)
  local actualCenter = row.x + (row.w / 2)
  assert(math.abs(actualCenter - expectedCenter) <= 0.5)
end

local axRows = M.buildRows({
  { index = 0, title = "First", active = true, frame = { x = 120, y = 20, w = 100, h = 40 } },
  { index = 1, title = "Second", active = false, frame = { x = 220, y = 20, w = 100, h = 40 } },
})
local axLayout = M.layoutRows({ x = 100, y = 20, w = 900, h = 52 }, axRows)
assert(axLayout[1].x == rounded((120 - 100) + ((100 - M.LABEL_WIDTH) / 2)))
assert(axLayout[1].y == rounded((20 - 20) + ((40 - M.LABEL_HEIGHT) / 2)))
assert(axLayout[2].x == rounded((220 - 100) + ((100 - M.LABEL_WIDTH) / 2)))
assert(axLayout[1].frame == nil)

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
local queryCount = 0
local fakeEnv = {
  now = function() return 10 end,
  queryChromeTabs = function()
    queryCount = queryCount + 1
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
controller.cache.rows = {}
controller.cache.updatedAt = 0
fakeOverlay.shown = false
assert(controller:handleKeyDown({
  getKeyCode = function() return M.HYPER_TRIGGER_KEY_CODE end,
  getFlags = function() return { ctrl = true, alt = true, shift = true, cmd = true } end,
}) == true)
assert(queryCount >= 2)
assert(fakeOverlay.shown == true)
assert(#controller.cache.rows == 2)
assert(controller:handleKeyDown({
  getKeyCode = function() return M.KEY_CODES.s end,
  getFlags = function() return {} end,
}) == true)
assert(activated[1] == 2)
assert(fakeOverlay.hidden == true)
controller:stop()

print("ok - Hammerspoon row and layout behavior")
