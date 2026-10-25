const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getSources: () => ipcRenderer.invoke('get-sources'),
  selectSource: (id) => ipcRenderer.invoke('select-source', id),
  countdown: () => ipcRenderer.invoke('countdown'),
  cancelCountdown: () => ipcRenderer.invoke('cancel-countdown'),
  save: (buffer, ext) => ipcRenderer.invoke('save', buffer, ext),
  screenAccess: () => ipcRenderer.invoke('screen-access'),
  showFile: (file) => ipcRenderer.invoke('show-file', file),
  setCamera: (on) => ipcRenderer.invoke('set-camera', on),
  resizeBubble: (key) => ipcRenderer.invoke('resize-bubble', key),
  resizeBar: (width, height) => ipcRenderer.send('resize-bar', width, height),
  setClickThrough: (on) => ipcRenderer.send('click-through', on),
  dragStart: (x, y, barTop) => ipcRenderer.send('drag-start', x, y, barTop),
  dragMove: (x, y) => ipcRenderer.send('drag-move', x, y),
  quit: () => ipcRenderer.invoke('quit'),
  onToggle: (cb) => ipcRenderer.on('toggle', () => cb()),
  onCamera: (cb) => ipcRenderer.on('camera', (_e, on) => cb(on)),
})
