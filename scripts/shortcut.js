// Runs after `npm install`: puts a Ploom launcher on the Desktop.
// Never fails the install; a missing shortcut just means using `npm start`.
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

function mac() {
  // A tiny AppleScript app that opens Electron.app on this folder
  const electronApp = path.resolve(require('electron'), '..', '..', '..')
  const app = path.join(os.homedir(), 'Desktop', 'Ploom.app')
  const str = (s) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  fs.rmSync(app, { recursive: true, force: true })
  execFileSync('osacompile', ['-o', app, '-e',
    `do shell script "open -a " & quoted form of ${str(electronApp)} & " --args " & quoted form of ${str(ROOT)}`])
  try {
    execFileSync('sips', ['-s', 'format', 'icns', path.join(ROOT, 'assets', 'icon.png'),
      '--out', path.join(app, 'Contents', 'Resources', 'applet.icns')], { stdio: 'ignore' })
    execFileSync('touch', [app]) // make Finder pick up the new icon
  } catch {}
  return app
}

try {
  const make = { win32: windows, darwin: mac }[process.platform]
  if (make && !process.env.CI) console.log(`Ploom: desktop shortcut created at ${make()}`)
} catch (err) {
  console.warn(`Ploom: couldn't create a desktop shortcut (${err.message}). Use \`npm start\` instead.`)
}
