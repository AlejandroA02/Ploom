const { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, screen, session, shell, systemPreferences } = require('electron')
const fs = require('fs')
const path = require('path')

const HOTKEY = 'CommandOrControl+Shift+L'
const IS_MAC = process.platform === 'darwin'
const ICON = path.join(__dirname, '..', 'assets', IS_MAC ? 'icon.png' : 'icon.ico')
const BUBBLE_SIZES = { s: 140, m: 220, l: 320 }

let controlWin, bubbleWin, countdownWin
let bubble = { size: 'm', shape: 'circle' }
let selectedSourceId = null

function createControl() {
  const { workArea } = screen.getPrimaryDisplay()
  // Initial size only; the page reports its real size via 'resize-bar'
  const width = 720, height = 80
  controlWin = new BrowserWindow({
    width, height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: workArea.y + workArea.height - height - 8,
    // enableLargerThanScreen lets a frameless window go above the macOS menu bar
    frame: false, transparent: true, resizable: false, alwaysOnTop: true, enableLargerThanScreen: true,
    skipTaskbar: false, hasShadow: false, title: 'Ploom', icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  controlWin.setAlwaysOnTop(true, 'screen-saver')
  // Keep the control bar out of recordings (Windows 10 2004+ / macOS)
  controlWin.setContentProtection(true)
  // Transparent areas pass clicks through; the page flips this as the mouse moves (see 'click-through')
  controlWin.setIgnoreMouseEvents(true, { forward: true })
  controlWin.loadFile(path.join(__dirname, 'control.html'))
  controlWin.on('closed', () => app.quit())
}

// The rectangle is 16:9 inside bubble.html's 10px shadow margin
function bubbleBounds() {
  const size = BUBBLE_SIZES[bubble.size]
  if (bubble.shape !== 'rect') return { width: size, height: size }
  const width = Math.round(size * 1.3)
  return { width, height: Math.round((width - 20) * 9 / 16) + 20 }
}

function createBubble() {
  const { workArea } = screen.getPrimaryDisplay()
  const { width, height } = bubbleBounds()
  bubbleWin = new BrowserWindow({
    width, height,
    x: workArea.x + 32,
    y: workArea.y + workArea.height - height - 32,
    frame: false, transparent: true, resizable: false, alwaysOnTop: true,
    skipTaskbar: true, hasShadow: false, focusable: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  bubbleWin.setAlwaysOnTop(true, 'screen-saver')
  bubbleWin.excludedFromShownWindowsMenu = true // keep it out of the Dock's window list
  // On macOS, desktopCapturer.getSources() can grow the window ~32px taller, warping the bubble.
  // Snap it back to its intended size, keeping the bottom edge in place.
  bubbleWin.on('resize', () => {
    const { x, y, width, height } = bubbleWin.getBounds()
    const want = bubbleBounds()
    if (width !== want.width || height !== want.height) bubbleWin.setBounds({ x, y: y + height - want.height, ...want })
  })
  bubbleWin.loadFile(path.join(__dirname, 'bubble.html'))
}

let cancelCountdown

// Resolves true when the countdown finishes, false if cancelled
function showCountdown() {
  return new Promise((resolve) => {
    const size = 220
    const { workArea } = screen.getPrimaryDisplay()
    countdownWin = new BrowserWindow({
      width: size, height: size,
      x: Math.round(workArea.x + (workArea.width - size) / 2),
      y: Math.round(workArea.y + (workArea.height - size) / 2),
      frame: false, transparent: true, resizable: false, alwaysOnTop: true,
      skipTaskbar: true, focusable: false, hasShadow: false,
    })
    countdownWin.setAlwaysOnTop(true, 'screen-saver')
    countdownWin.excludedFromShownWindowsMenu = true
    countdownWin.setContentProtection(true)
    countdownWin.setIgnoreMouseEvents(true)
    countdownWin.loadFile(path.join(__dirname, 'countdown.html'))
    const end = (finished) => {
      clearTimeout(timer)
      countdownWin.close()
      countdownWin = cancelCountdown = null
      resolve(finished)
    }
    const timer = setTimeout(() => end(true), 3000)
    cancelCountdown = () => end(false)
  })
}

function timestamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
  const ownIds = BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId())
  return sources
    .filter((s) => !ownIds.includes(s.id))
    .sort((a, b) => b.id.startsWith('screen:') - a.id.startsWith('screen:'))
    .map((s) => ({ id: s.id, name: s.name }))
})

ipcMain.handle('select-source', (_e, id) => { selectedSourceId = id })

ipcMain.handle('countdown', () => showCountdown())
ipcMain.handle('cancel-countdown', () => cancelCountdown?.())

ipcMain.handle('save', (_e, buffer, ext) => {
  const dir = path.join(app.getPath('videos'), 'Ploom')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `Recording ${timestamp()}.${ext}`)
  fs.writeFileSync(file, Buffer.from(buffer))
  return file
})

// macOS gives a blank capture (no error) without Screen Recording permission
ipcMain.handle('screen-access', () => !IS_MAC || systemPreferences.getMediaAccessStatus('screen') === 'granted')

ipcMain.handle('show-file', (_e, file) => shell.showItemInFolder(file))

ipcMain.handle('set-camera', (_e, on) => {
  if (on) bubbleWin.showInactive()
  else bubbleWin.hide()
  bubbleWin.webContents.send('camera', on)
})

// Takes any of { size, shape }; grows/shrinks around the bubble's center
ipcMain.handle('set-bubble', (_e, opts) => {
  bubble = { ...bubble, ...opts }
  const b = bubbleWin.getBounds()
  const { width, height } = bubbleBounds()
  bubbleWin.setBounds({ x: b.x + Math.round((b.width - width) / 2), y: b.y + Math.round((b.height - height) / 2), width, height })
})

// The bar window grows/shrinks to fit its content (menus, toasts, recording
// state), keeping its bottom-center fixed so the bar itself doesn't move.
ipcMain.on('resize-bar', (_e, width, height) => {
  const b = controlWin.getBounds()
  if (b.width === width && b.height === height) return
  controlWin.setBounds({
    x: Math.round(b.x + (b.width - width) / 2),
    y: b.y + b.height - height,
    width, height,
  })
})

ipcMain.on('click-through', (_e, on) => controlWin.setIgnoreMouseEvents(on, { forward: true }))

// Manual window drag: keep the cursor at the same spot on the bar it grabbed.
// Uses the page's pointer coordinates, so a busy main process (e.g. desktopCapturer)
// delays the move instead of losing it.
let dragOffset, barTop
ipcMain.on('drag-start', (_e, cx, cy, top) => {
  const [x, y] = controlWin.getPosition()
  dragOffset = { x: cx - x, y: cy - y }
  barTop = top
})
// The window may hang off the top of the screen (only its transparent menu room), but the bar
// stays on whichever display the cursor is on.
// macOS pointer coordinates can be fractional; setPosition only takes integers
ipcMain.on('drag-move', (_e, cx, cy) => {
  const d = screen.getDisplayNearestPoint({ x: Math.round(cx), y: Math.round(cy) }).bounds
  const [w, h] = controlWin.getSize()
  const x = Math.min(Math.max(cx - dragOffset.x, d.x), d.x + d.width - w)
  const y = Math.min(Math.max(cy - dragOffset.y, d.y - barTop), d.y + d.height - h)
  controlWin.setPosition(Math.round(x), Math.round(y))
})

ipcMain.handle('quit', () => app.quit())

app.whenReady().then(async () => {
  if (IS_MAC) {
    app.dock.setIcon(ICON)
    await systemPreferences.askForMediaAccess('microphone')
    await systemPreferences.askForMediaAccess('camera')
  }

  // getDisplayMedia() in the control window resolves to the source picked in our UI.
  // 'loopback' captures system audio (Windows; macOS 14.2+ with System Audio Recording permission).
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
    const source = sources.find((s) => s.id === selectedSourceId) || sources[0]
    callback(request.audioRequested ? { video: source, audio: 'loopback' } : { video: source })
  })

  createBubble()
  createControl()

  globalShortcut.register(HOTKEY, () => controlWin?.webContents.send('toggle'))
})

app.on('will-quit', () => globalShortcut.unregisterAll())
