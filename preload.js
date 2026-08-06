const { contextBridge, ipcRenderer } = require("electron");

// Surface volontairement petite : le renderer ne reçoit jamais ipcRenderer ni Node.js.
contextBridge.exposeInMainWorld("fastPocket", {
  getState: () => ipcRenderer.invoke("app:get-state"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  readClipboard: () => ipcRenderer.invoke("document:clipboard"),
  openDocument: () => ipcRenderer.invoke("document:open"),
  chooseVoice: () => ipcRenderer.invoke("voice:choose"),
  synthesize: (request) => ipcRenderer.invoke("tts:synthesize", request),
  exportAudio: (request) => ipcRenderer.invoke("tts:export", request),
  onBackendStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("backend:status", listener);
    return () => ipcRenderer.removeListener("backend:status", listener);
  }
});
