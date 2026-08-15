"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("batman", {
  onPetState(callback) {
    ipcRenderer.on("pet-state", (_event, state) => callback(state));
  },
  onPanelData(callback) {
    ipcRenderer.on("panel-data", (_event, data) => callback(data));
  },
  petClicked() {
    ipcRenderer.send("pet-clicked");
  },
  closePanel() {
    ipcRenderer.send("close-panel");
  },
  getState() {
    return ipcRenderer.invoke("get-state");
  },
  sleep(hours) {
    return ipcRenderer.invoke("sleep", hours);
  },
  wake() {
    return ipcRenderer.invoke("wake");
  },
  saveSettings(payload) {
    return ipcRenderer.invoke("save-settings", payload);
  },
  ask(text) {
    return ipcRenderer.invoke("ask", text);
  },
  quit() {
    return ipcRenderer.invoke("quit");
  },
});
