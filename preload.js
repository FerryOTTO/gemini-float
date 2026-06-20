// ═══════════════════════════════════════════════════════════════════
//  preload.js — 安全桥接脚本
// ═══════════════════════════════════════════════════════════════════

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("geminiFloat", {
  minimize: () => ipcRenderer.send("win:minimize"),
  hide: () => ipcRenderer.send("win:hide"),
  close: () => ipcRenderer.send("win:close"),
  toggleMode: () => ipcRenderer.send("win:toggleMode"),
  startDrag: () => ipcRenderer.send("win:startDrag"),
  isVisible: () => ipcRenderer.invoke("win:isVisible"),
});
