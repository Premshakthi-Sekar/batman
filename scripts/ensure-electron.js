"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const electronDir = path.join(root, "node_modules", "electron");
const pathFile = path.join(electronDir, "path.txt");
const cliJs = path.join(electronDir, "cli.js");
const downloadOnly = process.argv.includes("--download-only");

function platformPath(platform) {
  if (platform === "darwin" || platform === "mas") {
    return "Electron.app/Contents/MacOS/Electron";
  }
  if (platform === "win32") return "electron.exe";
  return "electron";
}

function hasBinary() {
  if (!fs.existsSync(pathFile)) return false;
  const relative = fs.readFileSync(pathFile, "utf8").trim();
  return fs.existsSync(path.join(electronDir, "dist", relative));
}

function cleanSkipFlags(env) {
  const next = { ...env };
  delete next.ELECTRON_SKIP_BINARY_DOWNLOAD;
  delete next.npm_config_electron_skip_binary_download;
  return next;
}

function requireFromElectron(id) {
  return require(require.resolve(id, { paths: [electronDir, root] }));
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (target) => {
      https
        .get(target, (response) => {
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            request(response.headers.location);
            return;
          }
          if (response.statusCode !== 200) {
            reject(new Error(`Download failed (${response.statusCode}): ${target}`));
            return;
          }
          response.pipe(file);
          file.on("finish", () => file.close(resolve));
        })
        .on("error", reject);
    };
    request(url);
  });
}

async function downloadWithElectronGet(version, platform, arch) {
  const { downloadArtifact } = requireFromElectron("@electron/get");
  const extract = requireFromElectron("extract-zip");
  console.log(`Fetching Electron ${version} (${platform}-${arch})...`);
  const zipPath = await downloadArtifact({
    version,
    artifactName: "electron",
    platform,
    arch,
  });
  const dist = path.join(electronDir, "dist");
  fs.mkdirSync(dist, { recursive: true });
  await extract(zipPath, { dir: dist });
  fs.writeFileSync(pathFile, platformPath(platform));
}

async function downloadFromGitHub(version, platform, arch) {
  const extract = requireFromElectron("extract-zip");
  const name = `electron-v${version}-${platform}-${arch}.zip`;
  const url = `https://github.com/electron/electron/releases/download/v${version}/${name}`;
  const dest = path.join(os.tmpdir(), name);
  console.log(`Fetching Electron from GitHub: ${url}`);
  await downloadFile(url, dest);
  const dist = path.join(electronDir, "dist");
  fs.mkdirSync(dist, { recursive: true });
  await extract(dest, { dir: dist });
  fs.writeFileSync(pathFile, platformPath(platform));
}

async function ensureBinary() {
  if (hasBinary()) return;

  if (!fs.existsSync(path.join(electronDir, "package.json"))) {
    throw new Error("Electron is missing. Run: npm install");
  }

  const { version } = require(path.join(electronDir, "package.json"));
  const platform = os.platform();
  const arch = os.arch();

  delete process.env.ELECTRON_SKIP_BINARY_DOWNLOAD;
  delete process.env.npm_config_electron_skip_binary_download;

  try {
    await downloadWithElectronGet(version, platform, arch);
  } catch (error) {
    console.warn(error.message || error);
    console.warn("Official downloader failed, trying GitHub...");
    await downloadFromGitHub(version, platform, arch);
  }

  if (!hasBinary()) {
    throw new Error("Electron downloaded, but the Mac app file is still missing.");
  }
}

function launch() {
  const start = spawnSync(process.execPath, [cliJs, "."], {
    stdio: "inherit",
    cwd: root,
    env: cleanSkipFlags(process.env),
  });
  process.exit(start.status ?? 1);
}

ensureBinary()
  .then(() => {
    if (!downloadOnly) launch();
  })
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
