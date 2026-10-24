const { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, screen, session, shell } = require('electron')
const fs = require('fs')
const path = require('path')

const HOTKEY = 'CommandOrControl+Shift+L'
const ICON = path.join(__dirname, '..', 'assets', 'icon.ico')
const BUBBLE_SIZES = { s: 140, m: 220, l: 320 }

let controlWin, bubbleWin, countdownWin
let selectedSourceId = null

function createControl() {
  const { workArea } = screen.getPrimaryDisplay()
  // Initial size only; the page reports its real size via 'resize-bar'
  const width = 720, height = 80
  controlWin = new BrowserWindow({
    width, height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: workArea.y + workArea.height - height - 8,
    frame: false, transparent: true, resizable: false, alwaysOnTop: true,
    skipTaskbar: false, hasShadow: false, title: 'Ploom', icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  controlWin.setAlwaysOnTop(true, 'screen-saver')
  // Keep the control bar out of recordings (Windows 10 2004+ / macOS)
  controlWin.setContentProtection(true)
  controlWin.loadFile(path.join(__dirname, 'control.html'))
  controlWin.on('closed', () => app.quit())
}

function createBubble() {
  const { workArea } = screen.getPrimaryDisplay()
  const size = BUBBLE_SIZES.m
  bubbleWin = new BrowserWindow({
    width: size, height: size,
    x: workArea.x + 32,
    y: workArea.y + workArea.height - size - 32,
    frame: false, transparent: true, resizable: false, alwaysOnTop: true,
    skipTaskbar: true, hasShadow: false, focusable: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  bubbleWin.setAlwaysOnTop(true, 'screen-saver')
  bubbleWin.loadFile(path.join(__dirname, 'bubble.html'))
}

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
    countdownWin.setContentProtection(true)
    countdownWin.setIgnoreMouseEvents(true)
    countdownWin.loadFile(path.join(__dirname, 'countdown.html'))
    setTimeout(() => {
      countdownWin.close()
      countdownWin = null
      resolve()
    }, 3000)
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

ipcMain.handle('save', (_e, buffer, ext) => {
  const dir = path.join(app.getPath('videos'), 'Ploom')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `Recording ${timestamp()}.${ext}`)
  fs.writeFileSync(file, Buffer.from(buffer))
  return file
})

ipcMain.handle('show-file', (_e, file) => shell.showItemInFolder(file))

ipcMain.handle('set-camera', (_e, on) => {
  if (on) bubbleWin.showInactive()
  else bubbleWin.hide()
  bubbleWin.webContents.send('camera', on)
})

ipcMain.handle('resize-bubble', (_e, key) => {
  const size = BUBBLE_SIZES[key]
  if (!size) return
  const [x, y] = bubbleWin.getPosition()
  const [w] = bubbleWin.getSize()
  // Grow/shrink around the bubble's center
  const offset = Math.round((size - w) / 2)
  bubbleWin.setBounds({ x: x - offset, y: y - offset, width: size, height: size })
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

ipcMain.handle('quit', () => app.quit())

app.whenReady().then(() => {
  // getDisplayMedia() in the control window resolves to the source picked in our UI.
  // 'loopback' captures system audio on Windows.
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
