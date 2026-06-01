local M = {}

M.CHROME_BUNDLE_ID = "com.google.Chrome"
M.HYPER_TRIGGER_KEY_CODE = 40 -- k
M.KARABINER_TRIGGER_KEY_CODE = 79 -- f18 bridge for Chrome-scoped Hyper+K
M.ESCAPE_KEY_CODE = 53
M.REFRESH_INTERVAL_SECONDS = 1.5
M.CACHE_STALE_SECONDS = 3.0
M.MODAL_TIMEOUT_SECONDS = 3.0
M.MAX_ONE_KEY_TABS = 27
M.OVERLAY_HEIGHT = 42
M.TAB_STRIP_LEFT_INSET = 86
M.TAB_STRIP_RIGHT_INSET = 22
M.MIN_TAB_WIDTH = 42
M.MAX_TAB_WIDTH = 220
M.MIN_USABLE_TAB_STRIP_WIDTH = 180
M.LABEL_LEFT_OFFSET = 8
M.LABEL_TOP = 7
M.LABEL_WIDTH = 18
M.LABEL_HEIGHT = 16
M.LABEL_TEXT_SIZE = 11
M.LABEL_RADIUS = 3
-- Vimium's default link-hint marker is a yellow gradient from #fff785 to #ffc542,
-- with border #c38a22 and text #302505. hs.canvas uses a solid fill here, so this
-- uses the gradient midpoint while keeping Vimium's border/text colors.
M.VIMIUM_HINT_FILL = { red = 1.00, green = 0.87, blue = 0.39, alpha = 0.92 }
M.VIMIUM_HINT_STROKE = { red = 0.76, green = 0.54, blue = 0.13, alpha = 0.88 }
M.VIMIUM_HINT_TEXT = { red = 0.19, green = 0.15, blue = 0.02, alpha = 0.98 }
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

function M.isHyperFlags(flags)
  return flags and flags.ctrl and flags.alt and flags.shift and flags.cmd
end

function M.isPlainFlags(flags)
  flags = flags or {}
  return not flags.ctrl and not flags.alt and not flags.shift and not flags.cmd and not flags.fn
end

function M.isModalTrigger(event)
  local keyCode = event:getKeyCode()
  if keyCode == M.KARABINER_TRIGGER_KEY_CODE then
    return true
  end
  return keyCode == M.HYPER_TRIGGER_KEY_CODE and M.isHyperFlags(event:getFlags())
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

  local leftInset = M.TAB_STRIP_LEFT_INSET
  local rightInset = M.TAB_STRIP_RIGHT_INSET
  local labelWidth = M.LABEL_WIDTH
  local usableWidth = math.max(M.MIN_USABLE_TAB_STRIP_WIDTH, windowFrame.w - leftInset - rightInset)
  local tabWidth = math.min(M.MAX_TAB_WIDTH, math.max(M.MIN_TAB_WIDTH, usableWidth / count))
  local y = M.LABEL_TOP

  for index, row in ipairs(rows) do
    local leadingOffset = math.min(M.LABEL_LEFT_OFFSET, math.max(3, tabWidth - labelWidth - 3))
    local x = leftInset + ((index - 1) * tabWidth) + leadingOffset
    visibleRows[#visibleRows + 1] = {
      active = row.active,
      label = row.label,
      tabIndex = row.tabIndex,
      title = row.title,
      x = math.floor(x),
      y = y,
      w = labelWidth,
      h = M.LABEL_HEIGHT,
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
    local background = M.VIMIUM_HINT_FILL
    local foreground = M.VIMIUM_HINT_TEXT
    local stroke = M.VIMIUM_HINT_STROKE

    elements[#elements + 1] = {
      type = "rectangle",
      action = "strokeAndFill",
      frame = { x = row.x, y = row.y, w = row.w, h = row.h },
      fillColor = background,
      strokeColor = stroke,
      strokeWidth = row.active and 1.1 or 0.8,
      roundedRectRadii = { xRadius = M.LABEL_RADIUS, yRadius = M.LABEL_RADIUS },
      withShadow = true,
      shadow = {
        blurRadius = row.active and 5 or 4,
        color = { red = 0.00, green = 0.00, blue = 0.00, alpha = row.active and 0.24 or 0.18 },
        offset = { h = 1, w = 0 },
      },
    }
    elements[#elements + 1] = {
      type = "text",
      text = string.upper(row.label),
      frame = { x = row.x, y = row.y + 1, w = row.w, h = row.h },
      textAlignment = "center",
      textColor = foreground,
      textFont = "Helvetica-Bold",
      textSize = M.LABEL_TEXT_SIZE,
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
    modalActive = false,
    modalTimer = nil,
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
          h = M.OVERLAY_HEIGHT,
        })
      end
      if self.modalActive then
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
      h = M.OVERLAY_HEIGHT,
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

  function controller:armModalTimeout()
    if self.modalTimer and self.modalTimer.stop then
      self.modalTimer:stop()
    end
    self.modalTimer = env.hs.timer.doAfter(M.MODAL_TIMEOUT_SECONDS, function()
      self:cancelModal()
    end)
  end

  function controller:cancelModal()
    self.modalActive = false
    if self.modalTimer and self.modalTimer.stop then
      self.modalTimer:stop()
    end
    self.modalTimer = nil
    self:hideOverlay()
  end

  function controller:activateModal()
    if not M.isChromeFrontmost(env) then
      return false
    end
    self.modalActive = true
    self:showOverlay()
    self:armModalTimeout()
    if env.now() - (self.cache.updatedAt or 0) > M.CACHE_STALE_SECONDS then
      self:refreshSoon()
    end
    return true
  end

  function controller:jumpToLabel(label)
    local target = nil
    for _, row in ipairs(self.cache.rows) do
      if row.label == label then
        target = row
        break
      end
    end

    self:cancelModal()

    if not target then
      return true
    end

    env.setChromeTabIndex(env, target.tabIndex)
    self:refreshSoon()
    return true
  end

  function controller:handleKeyDown(event)
    if M.isModalTrigger(event) then
      return self:activateModal()
    end

    if not self.modalActive then
      return false
    end

    if not M.isChromeFrontmost(env) then
      self:cancelModal()
      return false
    end

    if event:getKeyCode() == M.ESCAPE_KEY_CODE then
      self:cancelModal()
      return true
    end

    local flags = event:getFlags()
    if not M.isPlainFlags(flags) then
      return true
    end

    local label = self.keyCodeLabels[event:getKeyCode()]
    if not label then
      self:cancelModal()
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
      elseif self.modalActive then
        self:cancelModal()
      end
    end)
    self.eventtap = hs.eventtap.new({
      hs.eventtap.event.types.keyDown,
    }, function(event)
      local eventType = event:getType()
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
    if self.modalTimer and self.modalTimer.stop then
      self.modalTimer:stop()
      self.modalTimer = nil
    end
    self.modalActive = false
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
