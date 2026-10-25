// Runs after `npm install`: a Desktop shortcut on Windows, Ploom.app in Applications on macOS.
// Never fails the install; a missing app just means using `npm start`.
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.join(__dirname, '..')

function windows() {
  // The Desktop may be redirected (e.g. OneDrive), so ask Windows where it is
  const script = `
    $desktop = [Environment]::GetFolderPath('Desktop')
    $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'Ploom.lnk'))
    $lnk.TargetPath = $env:PLOOM_ELECTRON
    $lnk.Arguments = '"' + $env:PLOOM_ROOT + '"'
    $lnk.WorkingDirectory = $env:PLOOM_ROOT
    $lnk.IconLocation = $env:PLOOM_ICON
    $lnk.Save()
    $lnk.FullName`
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, PLOOM_ELECTRON: require('electron'), PLOOM_ROOT: ROOT, PLOOM_ICON: path.join(ROOT, 'assets', 'icon.ico') },
    encoding: 'utf8',
  }).trim()
}

async function mac() {
  // A real Ploom.app (not a launcher for Electron.app), so the Dock shows one icon
  const { packager } = require('@electron/packager')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ploom-'))
  const icon = path.join(tmp, 'icon.icns')
  execFileSync('sips', ['-s', 'format', 'icns', path.join(ROOT, 'assets', 'icon.png'), '--out', icon], { stdio: 'ignore' })
  const [built] = await packager({
    dir: ROOT, out: tmp, name: 'Ploom', icon, overwrite: true,
    appBundleId: 'com.alejandroa02.ploom',
    extendInfo: {
      NSCameraUsageDescription: 'Ploom shows your camera in the recording bubble.',
      NSMicrophoneUsageDescription: 'Ploom records your voice.',
      NSAudioCaptureUsageDescription: 'Ploom records your computer sound.',
    },
  })
  const app = '/Applications/Ploom.app'
  fs.rmSync(app, { recursive: true, force: true })
  execFileSync('ditto', [path.join(built, 'Ploom.app'), app]) // keeps the framework symlinks
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app]) // packaging broke Electron's signature
  fs.rmSync(tmp, { recursive: true, force: true })
  return app
}

(async () => {
  try {
    const make = { win32: windows, darwin: mac }[process.platform]
    if (make && !process.env.CI) console.log(`Ploom: installed at ${await make()}`)
  } catch (err) {
    console.warn(`Ploom: couldn't install the app (${err.message}). Use \`npm start\` instead.`)
  }
})()
