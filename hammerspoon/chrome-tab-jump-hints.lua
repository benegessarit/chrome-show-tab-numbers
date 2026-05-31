local M = {}

M.CHROME_BUNDLE_ID = "com.google.Chrome"
M.LEFT_CONTROL_KEY_CODE = 59
M.REFRESH_INTERVAL_SECONDS = 1.5
M.CACHE_STALE_SECONDS = 3.0
M.MAX_ONE_KEY_TABS = 27
M.LABELS = {
  "a", "s", "d", "f", "j", "k", "l", ";",
  "q", "w", "e", "r", "u", "i", "o", "p",
  "z", "x", "c", "v", "b", "n", "m", "g", "h", "y", "t",
}
M.KEY_CODES = {
  a = 0,
  s = 1,
  d = 2,
  f = 3,
  h = 4,
  g = 5,
  z = 6,
  x = 7,
  c = 8,
  v = 9,
  b = 11,
  q = 12,
  w = 13,
  e = 14,
  r = 15,
  y = 16,
  t = 17,
  u = 32,
  i = 34,
  o = 31,
  p = 35,
  l = 37,
  j = 38,
  k = 40,
  [";"] = 41,
  n = 45,
  m = 46,
}

local function buildKeyCodeLabels()
  local byCode = {}
  for label, code in pairs(M.KEY_CODES) do
    byCode[code] = label
  end
  return byCode
end

M.KEY_CODE_LABELS = buildKeyCodeLabels()

local function jsonEscape(value)
  return string.format("%q", value)
end

local function defaultNow(env)
  if env.hs and env.hs.timer and env.hs.timer.secondsSinceEpoch then
    return env.hs.timer.secondsSinceEpoch()
  end
  return os.time()
end

local function frontmostBundleID(env)
  local hs = env.hs
  local app = hs.application.frontmostApplication()
  return app and app:bundleID() or nil
end

local function chromeApp(env)
  local hs = env.hs
  local app = hs.application.get(M.CHROME_BUNDLE_ID)
  if app then
    return app
  end
  local apps = hs.application.applicationsForBundleID(M.CHROME_BUNDLE_ID)
  return apps and apps[1] or nil
end

local function chromeWindow(env)
  local hs = env.hs
  local app = chromeApp(env)
  if not app then
    return nil
  end

  local front = hs.window.frontmostWindow()
  if front and front:application() and front:application():bundleID() == M.CHROME_BUNDLE_ID then
    return front
  end

  return app:mainWindow() or app:focusedWindow()
end

function M.isChromeFrontmost(env)
  return frontmostBundleID(env) == M.CHROME_BUNDLE_ID
end

function M.buildRows(tabs)
  local rows = {}
  local tabCount = math.min(#tabs, #M.LABELS, M.MAX_ONE_KEY_TABS)
  for index = 1, tabCount do
    local tab = tabs[index] or {}
    local tabIndex = tonumber(tab.tabIndex or tab.index or index) or index
    if tab.index and not tab.tabIndex then
      tabIndex = tonumber(tab.index) + 1
    end
    rows[#rows + 1] = {
      active = tab.active == true,
      label = M.LABELS[#rows + 1],
      tabIndex = tabIndex,
      title = tab.title or tab.url or "Untitled tab",
      url = tab.url or "",
    }
  end
  return rows
end

function M.layoutRows(windowFrame, rows)
  local visibleRows = {}
  local count = #rows
  if count == 0 then
    return visibleRows
  end

  local leftInset = 86
  local rightInset = 22
  local usableWidth = math.max(180, windowFrame.w - leftInset - rightInset)
  local tabWidth = math.min(220, math.max(42, usableWidth / count))
  local y = 8

  for index, row in ipairs(rows) do
    local x = leftInset + ((index - 1) * tabWidth) + math.max(4, (tabWidth - 34) / 2)
    visibleRows[#visibleRows + 1] = {
      active = row.active,
      label = row.label,
      tabIndex = row.tabIndex,
      title = row.title,
      x = math.floor(x),
      y = y,
      w = 34,
      h = 30,
    }
  end

  return visibleRows
end

local function queryChromeTabs(env)
  local hs = env.hs
  local ok, object, descriptor = hs.osascript.javascript(([[
(() => {
  const chrome = Application(%s);
  if (!chrome.running()) {
    return JSON.stringify({ ok: false, error: "Chrome is not running", tabs: [] });
  }
  const windows = chrome.windows();
  if (windows.length === 0) {
    return JSON.stringify({ ok: true, tabs: [] });
  }
  const win = windows[0];
  const activeTabIndex = win.activeTabIndex();
  const tabs = win.tabs().map((tab, index) => ({
    active: index + 1 === activeTabIndex,
    index,
    tabIndex: index + 1,
    title: tab.title(),
    url: tab.url(),
  }));
  return JSON.stringify({ ok: true, tabs });
})()
]]):format(jsonEscape(M.CHROME_BUNDLE_ID)))

  if not ok then
    return nil, descriptor or object or "Chrome tab query failed"
  end

  local raw = type(object) == "string" and object or descriptor
  local parsed = hs.json.decode(raw)
  if not parsed or parsed.ok == false then
    return nil, parsed and parsed.error or "Chrome tab query returned no data"
  end

  return parsed.tabs or {}, nil
end

local function setChromeTabIndex(env, tabIndex)
  local hs = env.hs
  local win = chromeWindow(env)
  if win and win.focusTab then
    local focused = win:focusTab(tabIndex)
    if focused then
      return true, nil
    end
  end

  local ok, _object, descriptor = hs.osascript.javascript(([[
(() => {
  const chrome = Application(%s);
  if (!chrome.running()) {
    return JSON.stringify({ ok: false, error: "Chrome is not running" });
  }
  const windows = chrome.windows();
  if (windows.length === 0) {
    return JSON.stringify({ ok: false, error: "Chrome has no front window" });
  }
  windows[0].activeTabIndex.set(%d);
  return JSON.stringify({ ok: true, activeTabIndex: windows[0].activeTabIndex() });
})()
]]):format(jsonEscape(M.CHROME_BUNDLE_ID), tabIndex))

  if not ok then
    return false, descriptor or "Chrome tab activation failed"
  end
  return true, nil
end

local function makeCanvasElements(rows)
  local elements = {}
  for _, row in ipairs(rows) do
    local background = row.active and { red = 0.98, green = 0.78, blue = 0.26, alpha = 0.96 }
      or { red = 0.07, green = 0.09, blue = 0.14, alpha = 0.92 }
    local foreground = row.active and { red = 0.07, green = 0.09, blue = 0.14, alpha = 1.0 }
      or { red = 0.98, green = 0.98, blue = 0.96, alpha = 1.0 }
    local stroke = row.active and { red = 0.07, green = 0.09, blue = 0.14, alpha = 1.0 }
      or { red = 0.98, green = 0.78, blue = 0.26, alpha = 1.0 }

    elements[#elements + 1] = {
      type = "rectangle",
      action = "strokeAndFill",
      frame = { x = row.x, y = row.y, w = row.w, h = row.h },
      fillColor = background,
      strokeColor = stroke,
      strokeWidth = 2,
      roundedRectRadii = { xRadius = 8, yRadius = 8 },
    }
    elements[#elements + 1] = {
      type = "text",
      text = string.upper(row.label),
      frame = { x = row.x, y = row.y + 2, w = row.w, h = row.h },
      textAlignment = "center",
      textColor = foreground,
      textFont = "Menlo-Bold",
      textSize = 20,
    }
  end
  return elements
end

function M.create(overrides)
  local env = overrides or {}
  env.hs = env.hs or hs
  env.now = env.now or function()
    return defaultNow(env)
  end
  env.queryChromeTabs = env.queryChromeTabs or queryChromeTabs
  env.setChromeTabIndex = env.setChromeTabIndex or setChromeTabIndex

  local controller = {
    cache = { rows = {}, updatedAt = 0, error = nil },
    ctrlHeld = false,
    overlay = nil,
    refreshTimer = nil,
    eventtap = nil,
    keyCodeLabels = M.KEY_CODE_LABELS,
  }

  function controller:refreshCache()
    local tabs, err = env.queryChromeTabs(env)
    if tabs then
      self.cache.rows = M.buildRows(tabs)
      self.cache.updatedAt = env.now()
      self.cache.error = nil
      local win = chromeWindow(env)
      local frame = win and win:frame()
      if frame then
        self:prepareOverlay({
          x = frame.x,
          y = frame.y,
          w = frame.w,
          h = 52,
        })
      end
      if self.ctrlHeld then
        self:showOverlay()
      end
    else
      self.cache.error = tostring(err or "unknown Chrome query error")
    end
  end

  function controller:destroyOverlay()
    if self.overlay then
      self.overlay:delete(0)
      self.overlay = nil
    end
  end

  function controller:prepareOverlay(canvasFrame)
    local hs = env.hs
    if not self.overlay then
      self.overlay = hs.canvas.new(canvasFrame)
      local levels = hs.canvas.windowLevels or {}
      self.overlay:level(levels.overlay or levels.status or levels.floating or 25)
      self.overlay:behaviorAsLabels({ "canJoinAllSpaces", "fullScreenAuxiliary" })
      self.overlay:clickActivating(false)
    else
      self.overlay:frame(canvasFrame)
    end
    return self.overlay
  end

  function controller:showOverlay()
    if not M.isChromeFrontmost(env) then
      self:hideOverlay()
      return false
    end

    local win = chromeWindow(env)
    local frame = win and win:frame()
    if not frame or #self.cache.rows == 0 then
      self:hideOverlay()
      return false
    end

    local canvasFrame = {
      x = frame.x,
      y = frame.y,
      w = frame.w,
      h = 52,
    }
    local positionedRows = M.layoutRows(canvasFrame, self.cache.rows)
    local elements = makeCanvasElements(positionedRows)

    self:prepareOverlay(canvasFrame)
    self.overlay:replaceElements(table.unpack(elements))
    self.overlay:show(0)
    return true
  end

  function controller:hideOverlay()
    if self.overlay then
      self.overlay:hide(0)
    end
  end

  function controller:refreshSoon()
    env.hs.timer.doAfter(0.01, function()
      self:refreshCache()
    end)
  end

  function controller:handleFlagsChanged(event)
    local keyCode = event:getKeyCode()
    if keyCode ~= M.LEFT_CONTROL_KEY_CODE then
      return false
    end

    local flags = event:getFlags()
    if flags.ctrl and not self.ctrlHeld then
      self.ctrlHeld = true
      self:showOverlay()
      if env.now() - (self.cache.updatedAt or 0) > M.CACHE_STALE_SECONDS then
        self:refreshSoon()
      end
      return false
    end

    if not flags.ctrl and self.ctrlHeld then
      self.ctrlHeld = false
      self:hideOverlay()
      return false
    end

    return false
  end

  function controller:jumpToLabel(label)
    local target = nil
    for _, row in ipairs(self.cache.rows) do
      if row.label == label then
        target = row
        break
      end
    end

    self.ctrlHeld = false
    self:hideOverlay()

    if not target then
      return true
    end

    env.setChromeTabIndex(env, target.tabIndex)
    self:refreshSoon()
    return true
  end

  function controller:handleKeyDown(event)
    if not self.ctrlHeld or not M.isChromeFrontmost(env) then
      return false
    end

    local flags = event:getFlags()
    if flags.cmd or flags.alt or flags.shift or not flags.ctrl then
      return false
    end

    local label = self.keyCodeLabels[event:getKeyCode()]
    if not label then
      return false
    end

    return self:jumpToLabel(label)
  end

  function controller:start()
    local hs = env.hs
    self:refreshCache()
    self.refreshTimer = hs.timer.doEvery(M.REFRESH_INTERVAL_SECONDS, function()
      if M.isChromeFrontmost(env) then
        self:refreshCache()
      end
    end)
    self.eventtap = hs.eventtap.new({
      hs.eventtap.event.types.flagsChanged,
      hs.eventtap.event.types.keyDown,
    }, function(event)
      local eventType = event:getType()
      if eventType == hs.eventtap.event.types.flagsChanged then
        return self:handleFlagsChanged(event)
      end
      if eventType == hs.eventtap.event.types.keyDown then
        return self:handleKeyDown(event)
      end
      return false
    end):start()
    return self
  end

  function controller:stop()
    if self.eventtap then
      self.eventtap:stop()
      self.eventtap = nil
    end
    if self.refreshTimer then
      self.refreshTimer:stop()
      self.refreshTimer = nil
    end
    self:destroyOverlay()
  end

  return controller
end

function M.start(overrides)
  if _G.chromeTabJumpHints and _G.chromeTabJumpHints.stop then
    _G.chromeTabJumpHints:stop()
  end
  _G.chromeTabJumpHints = M.create(overrides):start()
  return _G.chromeTabJumpHints
end

return M
