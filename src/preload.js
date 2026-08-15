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
  dragStart(point) {
    ipcRenderer.send("pet-drag-start", point);
  },
  dragMove(point) {
    ipcRenderer.send("pet-drag-move", point);
  },
  dragEnd(payload) {
    ipcRenderer.send("pet-drag-end", payload);
  },
  hover(isHover) {
    ipcRenderer.send("pet-hover", isHover);
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
