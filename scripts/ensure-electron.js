"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const electronDir = path.join(root, "node_modules", "electron");
const installJs = path.join(electronDir, "install.js");
const pathFile = path.join(electronDir, "path.txt");
const cliJs = path.join(electronDir, "cli.js");

if (!fs.existsSync(installJs)) {
  console.error("Electron is missing. Run: npm install");
  process.exit(1);
}

if (!fs.existsSync(pathFile)) {
  console.log("Downloading Electron. This can take a minute...");
  const install = spawnSync(process.execPath, [installJs], {
    stdio: "inherit",
    cwd: root,
  });
  if (install.status !== 0) {
    console.error("Electron download failed. Stay on this network and try again:");
    console.error("  node node_modules/electron/install.js");
    process.exit(install.status || 1);
  }
}

if (!fs.existsSync(pathFile)) {
  console.error("Electron still has no binary. Run:");
  console.error("  node node_modules/electron/install.js");
  process.exit(1);
}

const start = spawnSync(process.execPath, [cliJs, "."], {
  stdio: "inherit",
  cwd: root,
});
process.exit(start.status ?? 1);
