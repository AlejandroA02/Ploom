const $ = (id) => document.getElementById(id)

const MIC_KEY = 'micDeviceId'
const opts = { sys: true, cam: true }
let state = 'idle' // idle | starting | recording | saving
let recorder, chunks, streams, tracks, recDest, sysNode
let elapsedMs, segmentStart, timerId
let audioCtx, analyser, micStream, micNode
let micRequest = 0
let sources = [], mics = []
let sourceId = null, micId = null
let toastTimer

// ---------- UI helpers ----------

function setView(view) {
  document.body.dataset.state = view // idle | counting | recording | paused
}

function showToast(kind, text, { file, autoHideMs } = {}) {
  clearTimeout(toastTimer)
  const ico = { ok: 'i-check', err: 'i-alert' }[kind]
  $('toast').dataset.kind = kind
  $('toastIco').innerHTML = ico ? `<svg class="i"><use href="#${ico}"/></svg>` : ''
  $('toastText').textContent = text
  $('toastFile').textContent = file ? file.split(/[\\/]/).pop() : ''
  $('toastAction').hidden = !file
  $('toastAction').onclick = file ? () => window.api.showFile(file) : null
  $('toast').classList.toggle('has-action', !!file)
  $('toast').hidden = false
  if (autoHideMs) toastTimer = setTimeout(hideToast, autoHideMs)
}

function hideToast() {
  clearTimeout(toastTimer)
  $('toast').hidden = true
}

const showError = (text) => showToast('err', text, { autoHideMs: 6000 })

// Keep the window as big as its content. While idle, it also reserves room for
// the device menu above the bar so opening a menu never resizes the window
// (resizing a transparent window flashes a stale frame for a few frames).
const MENU_ROOM = 310 // menu max-height + gap
new ResizeObserver(() => {
  const r = $('root').getBoundingClientRect()
  const reserved = document.body.dataset.state === 'idle' ? $('bar').offsetHeight + 32 + MENU_ROOM : 0
  window.api.resizeBar(Math.ceil(r.width), Math.ceil(Math.max(r.height, reserved)))
}).observe($('root'))

// The reserved space is transparent: let clicks there fall through to whatever is behind
let clickThrough = true
document.addEventListener('mousemove', (e) => {
  const through = e.target === document.documentElement || e.target === document.body || e.target === $('root')
  if (through !== clickThrough) window.api.setClickThrough((clickThrough = through))
})

// Drag the bar by hand: -webkit-app-region drag areas swallow mouse moves, which click-through relies on
$('bar').addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('button')) return
  const bar = e.currentTarget
  bar.setPointerCapture(e.pointerId)
  window.api.dragStart(e.screenX, e.screenY, bar.getBoundingClientRect().top)
  const move = (ev) => window.api.dragMove(ev.screenX, ev.screenY)
  bar.addEventListener('pointermove', move)
  bar.addEventListener('lostpointercapture', () => bar.removeEventListener('pointermove', move), { once: true })
})

// ---------- Device menus ----------

function openMenu(kind, chip) {
  const menu = $('menu')
  const items = kind === 'source'
    ? sources.map((s) => ({ value: s.id, label: s.name, icon: s.id.startsWith('screen:') ? 'i-monitor' : 'i-window' }))
    : [...mics.map((m) => ({ value: m.deviceId, label: micName(m.label) })), { value: 'none', label: 'No mic' }]
  const current = kind === 'source' ? sourceId : micId

  menu.replaceChildren()
  const header = document.createElement('div')
  header.className = 'ph'
  header.textContent = kind === 'source' ? 'Record' : 'Microphone'
  menu.append(header)
  for (const item of items) {
    const opt = document.createElement('button')
    opt.className = 'opt'
    opt.setAttribute('role', 'option')
    opt.setAttribute('aria-selected', item.value === current)
    opt.innerHTML = '<svg class="i chk"><use href="#i-check"/></svg>' +
      (item.icon ? `<svg class="i kind"><use href="#${item.icon}"/></svg>` : '') + '<span></span>'
    opt.querySelector('span').textContent = item.label
    opt.title = item.label
    opt.addEventListener('click', () => {
      closeMenu()
      kind === 'source' ? selectSource(item.value) : selectMic(item.value)
    })
    menu.append(opt)
  }

  menu.dataset.kind = kind
  menu.hidden = false
  // Line the menu up with its chip, but never past the bar's right edge (that would widen the window)
  const bar = $('bar').getBoundingClientRect()
  const left = chip.getBoundingClientRect().left - bar.left - 6
  menu.style.marginLeft = `${Math.max(0, Math.min(left, bar.width - menu.offsetWidth))}px`
  chip.setAttribute('aria-expanded', 'true')
  menu.querySelector('[aria-selected="true"]')?.focus()
}

function closeMenu() {
  $('menu').hidden = true
  delete $('menu').dataset.kind
  document.querySelectorAll('[aria-haspopup]').forEach((c) => c.setAttribute('aria-expanded', 'false'))
}

function toggleMenu(kind, chip) {
  if ($('menu').dataset.kind === kind) return closeMenu()
  closeMenu()
  // Opens instantly from the cached list; hovering the chip refreshed it (see loadSources)
  openMenu(kind, chip)
}

// ---------- Sources ----------

// getSources blocks the main process for ~0.4s (which also stalls window drags),
// so it runs when the source chip is hovered, not on click or focus
let sourcesLoading
async function loadSources() {
  if (sourcesLoading) return sourcesLoading
  sourcesLoading = window.api.getSources()
  try { sources = await sourcesLoading } finally { sourcesLoading = null }
  if (!sources.some((s) => s.id === sourceId)) sourceId = sources[0]?.id ?? null
  renderSourceChip()
  // Refresh the menu in place if it opened before the list came back
  if ($('menu').dataset.kind === 'source') openMenu('source', $('sourceChip'))
}

function renderSourceChip() {
  const s = sources.find((x) => x.id === sourceId)
  $('sourceLabel').textContent = s ? s.name : 'No screens found'
  $('sourceIcon').setAttribute('href', s && !s.id.startsWith('screen:') ? '#i-window' : '#i-monitor')
}

function selectSource(id) {
  sourceId = id
  renderSourceChip()
}

// ---------- Microphone ----------

function getAudioCtx() {
  // Created once and reused: creating one can take seconds on some machines
  if (!audioCtx) {
    audioCtx = new AudioContext()
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
  }
  return audioCtx
}

// "Default - Microphone (USB Condenser Microphone) (31b2:0011)" -> "Default - USB Condenser Microphone"
function micName(label) {
  if (!label) return 'Microphone'
  return label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)$/i, '').replace(/Microphone \((.+)\)$/, '$1')
}

async function loadMics() {
  mics = (await navigator.mediaDevices.enumerateDevices())
    .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications')
  const wanted = micId ?? localStorage.getItem(MIC_KEY) ?? 'default'
  micId = wanted === 'none' || mics.some((m) => m.deviceId === wanted) ? wanted : mics[0]?.deviceId ?? 'none'
  renderMicChip()
}

function renderMicChip() {
  const m = mics.find((x) => x.deviceId === micId)
  $('micLabel').textContent = micId === 'none' ? 'No mic' : micName(m?.label)
  document.body.classList.toggle('no-mic', micId === 'none')
}

async function openMic(id) {
  const request = ++micRequest
  micNode?.disconnect()
  micStream?.getTracks().forEach((t) => t.stop())
  micStream = micNode = null
  if (id === 'none') return
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: id }, echoCancellation: true, noiseSuppression: true },
  })
  // A newer selection came in while this one was opening
  if (request !== micRequest) return stream.getTracks().forEach((t) => t.stop())
  micStream = stream
  micNode = getAudioCtx().createMediaStreamSource(micStream)
  micNode.connect(analyser)
}

async function selectMic(id) {
  micId = id
  localStorage.setItem(MIC_KEY, id)
  renderMicChip()
  if (id !== 'none') showToast('info', 'Switching mic…')
  try {
    await openMic(id)
    hideToast()
  } catch (err) {
    showError(`Mic error: ${err.message}`)
  }
}

async function initMic() {
  micId = localStorage.getItem(MIC_KEY) || 'default'
  try {
    await openMic(micId)
  } catch {
    micId = 'default' // saved mic unplugged
    await openMic(micId)
  }
  await loadMics() // labels are only available after mic permission
}

const meterBuf = new Float32Array(512)
const meterBars = [...document.querySelectorAll('[data-meter] span')]
let meterLevel = 0
function renderMeter() {
  let target = 0
  if (micNode) {
    analyser.getFloatTimeDomainData(meterBuf)
    const rms = Math.sqrt(meterBuf.reduce((sum, v) => sum + v * v, 0) / meterBuf.length)
    // Map -60 dB..0 dB to 0..1
    target = Math.min(1, Math.max(0, (20 * Math.log10(rms || 1e-6) + 60) / 60))
  }
  // Jump up instantly, fall back smoothly
  meterLevel = target > meterLevel ? target : meterLevel * 0.85 + target * 0.15
  meterBars.forEach((bar) => {
    const i = [...bar.parentElement.children].indexOf(bar)
    bar.classList.toggle('on', meterLevel > (i + 0.5) / 5.5)
  })
  requestAnimationFrame(renderMeter)
}

// ---------- Recording ----------

function activeMs() {
  return elapsedMs + (segmentStart ? Date.now() - segmentStart : 0)
}

function renderTimer() {
  const s = Math.floor(activeMs() / 1000)
  $('timer').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function pickMimeType() {
  // MP4 (H.264 High@4.0 + AAC) plays everywhere; WebM is the fallback
  return ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    .find((t) => MediaRecorder.isTypeSupported(t))
}

async function startRecording() {
  if (state !== 'idle') return
  state = 'starting'
  closeMenu()
  showToast('info', 'Starting…')
  streams = []
  try {
    if (!(await window.api.screenAccess())) {
      throw new Error('allow Screen Recording for Ploom (or your terminal with npm start) in System Settings → Privacy & Security, then restart Ploom')
    }
    await window.api.selectSource(sourceId)
    let display, sysWarning
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: opts.sys })
    } catch (err) {
      if (!opts.sys) throw err
      // System audio unsupported here; record without it rather than not at all
      display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false })
      sysWarning = true
    }
    streams.push(display)

    // macOS hands back an already-ended audio track when System Audio Recording isn't allowed
    const sysTracks = display.getAudioTracks().filter((t) => t.readyState === 'live')
    if (opts.sys && !sysTracks.length) sysWarning = true

    // Mix the selected mic + system audio into a single track
    tracks = [display.getVideoTracks()[0]]
    if (sysTracks.length) {
      sysNode = getAudioCtx().createMediaStreamSource(new MediaStream(sysTracks))
    }
    if (micNode || sysNode) {
      recDest = getAudioCtx().createMediaStreamDestination()
      micNode?.connect(recDest)
      sysNode?.connect(recDest)
      tracks.push(...recDest.stream.getAudioTracks())
    }

    hideToast()
    setView('counting')
    state = 'counting'
    if (!(await window.api.countdown())) {
      cleanup()
      setView('idle')
      state = 'idle'
      return
    }

    // User clicked the OS "stop sharing" or the window closed
    display.getVideoTracks()[0].onended = () => stopRecording()
    startTake()
    if (sysWarning) showError('Computer sound unavailable, recording without it')
  } catch (err) {
    console.error(err)
    cleanup()
    setView('idle')
    state = 'idle'
    showError(`Couldn't start: ${err.message}`)
  }
}

function startTake() {
  chunks = []
  recorder = new MediaRecorder(new MediaStream(tracks), {
    mimeType: pickMimeType(),
    videoBitsPerSecond: 5_000_000,
  })
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  recorder.onstop = finishRecording
  recorder.start(1000)
  elapsedMs = 0
  segmentStart = Date.now()
  clearInterval(timerId)
  timerId = setInterval(renderTimer, 250)
  renderTimer()
  setView('recording')
  state = 'recording'
}

async function restartRecording() {
  if (state !== 'recording') return
  // Detach first: late data from the old take would land in the new take's chunks
  recorder.ondataavailable = recorder.onstop = null
  recorder.stop()
  chunks = []
  clearInterval(timerId)
  state = 'counting'
  setView('counting')
  if (!(await window.api.countdown()) || tracks[0].readyState === 'ended') {
    cleanup()
    setView('idle')
    state = 'idle'
    return
  }
  startTake()
}

function stopRecording() {
  if (state !== 'recording') return
  state = 'saving'
  if (segmentStart) elapsedMs += Date.now() - segmentStart
  segmentStart = null
  recorder.stop()
}

function togglePause() {
  if (state !== 'recording') return
  if (recorder.state === 'recording') {
    recorder.pause()
    elapsedMs += Date.now() - segmentStart
    segmentStart = null
    setView('paused')
  } else {
    recorder.resume()
    segmentStart = Date.now()
    setView('recording')
  }
}

function cleanup() {
  clearInterval(timerId)
  streams?.forEach((s) => s.getTracks().forEach((t) => t.stop()))
  streams = []
  // Keep the mic open for the level meter; just unhook it from the recording
  if (recDest) micNode?.disconnect(recDest)
  sysNode?.disconnect()
  recDest = sysNode = null
}

async function finishRecording() {
  cleanup()
  setView('idle')
  showToast('info', 'Saving…')
  try {
    let blob = new Blob(chunks, { type: recorder.mimeType })
    // MP4 muxer only flushes on stop; a near-instant stop yields nothing
    if (!blob.size) throw new Error('recording too short')
    const ext = recorder.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
    // MediaRecorder WebM has no duration header; without this, players can't seek
    if (ext === 'webm') blob = await window.ysFixWebmDuration(blob, elapsedMs, { logger: false })
    const file = await window.api.save(await blob.arrayBuffer(), ext)
    showToast('ok', 'Saved', { file, autoHideMs: 10000 })
  } catch (err) {
    console.error(err)
    showError(`Save failed: ${err.message}`)
  }
  chunks = []
  state = 'idle'
}

// ---------- Wiring ----------

function bindToggle(key) {
  $(key).addEventListener('click', () => {
    opts[key] = !opts[key]
    $(key).setAttribute('aria-pressed', opts[key])
    if (key === 'cam') window.api.setCamera(opts.cam)
  })
}

;['sys', 'cam'].forEach(bindToggle)
$('sourceChip').addEventListener('click', (e) => toggleMenu('source', e.currentTarget))
$('sourceChip').addEventListener('pointerenter', loadSources)
$('micChip').addEventListener('click', (e) => toggleMenu('mic', e.currentTarget))
document.addEventListener('click', (e) => {
  if (!e.target.closest('#menu, [aria-haspopup]')) closeMenu()
})
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu())
window.addEventListener('blur', closeMenu)
navigator.mediaDevices.addEventListener('devicechange', async () => {
  const before = micId
  await loadMics()
  if (micId !== before) openMic(micId).catch((err) => showError(`Mic error: ${err.message}`))
})
$('start').addEventListener('click', startRecording)
$('cancel').addEventListener('click', () => window.api.cancelCountdown())
$('stop').addEventListener('click', stopRecording)
$('pause').addEventListener('click', togglePause)
$('restart').addEventListener('click', restartRecording)
$('quit').addEventListener('click', () => window.api.quit())
window.api.onToggle(() => {
  if (state === 'idle') startRecording()
  else if (state === 'counting') window.api.cancelCountdown()
  else stopRecording()
})

loadSources()
initMic().catch((err) => showError(`Mic error: ${err.message}`))
renderMeter()
