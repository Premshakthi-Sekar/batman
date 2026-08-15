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

function run(command, args) {
  console.log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit ${result.status}`);
  }
}

function zipUrl(version, platform, arch) {
  const name = `electron-v${version}-${platform}-${arch}.zip`;
  return {
    name,
    url: `https://github.com/electron/electron/releases/download/v${version}/${name}`,
    mirror: `https://npmmirror.com/mirrors/electron/v${version}/${name}`,
  };
}

function downloadWithCurl(url, dest) {
  run("curl", ["-L", "--fail", "--retry", "3", "--retry-all-errors", "-o", dest, url]);
}

function downloadWithHttps(url, dest) {
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

function extractZip(zipFile, dist) {
  fs.mkdirSync(dist, { recursive: true });
  if (process.platform === "darwin") {
    run("ditto", ["-x", "-k", zipFile, dist]);
    return;
  }
  run("unzip", ["-o", zipFile, "-d", dist]);
}

async function fetchZip(version, platform, arch) {
  const { name, url, mirror } = zipUrl(version, platform, arch);
  const dest = path.join(os.tmpdir(), name);
  const sources = [url, mirror];
  let lastError;
  for (const source of sources) {
    try {
      console.log(`Downloading Electron ${version} from:`);
      console.log(`  ${source}`);
      if (spawnSync("curl", ["--version"], { stdio: "ignore" }).status === 0) {
        downloadWithCurl(source, dest);
      } else {
        await downloadWithHttps(source, dest);
      }
      const size = fs.statSync(dest).size;
      if (size < 1_000_000) {
        throw new Error(`Download too small (${size} bytes), not the Electron app`);
      }
      console.log(`Downloaded ${(size / 1_000_000).toFixed(1)} MB`);
      return dest;
    } catch (error) {
      lastError = error;
      console.warn(error.message || error);
    }
  }
  throw lastError || new Error("Could not download Electron");
}

async function ensureBinary() {
  if (hasBinary()) {
    console.log("Electron is already installed.");
    return;
  }

  const pkgPath = path.join(electronDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    throw new Error("Electron npm package is missing. Run: npm install");
  }

  const { version } = require(pkgPath);
  const platform = os.platform();
  const arch = os.arch();
  const dist = path.join(electronDir, "dist");

  console.log(`Need Electron ${version} for ${platform}-${arch}`);
  const zipFile = await fetchZip(version, platform, arch);
  extractZip(zipFile, dist);
  fs.writeFileSync(pathFile, platformPath(platform));

  if (!hasBinary()) {
    throw new Error("Unzip finished, but Electron.app is still missing.");
  }
  console.log("Electron is ready.");
}

function launch() {
  console.log("Starting Desktop Batman...");
  const start = spawnSync(process.execPath, [cliJs, "."], {
    stdio: "inherit",
    cwd: root,
  });
  process.exit(start.status ?? 1);
}

ensureBinary()
  .then(() => {
    if (!downloadOnly) launch();
  })
  .catch((error) => {
    console.error("\nCould not set up Electron:");
    console.error(error.stack || error.message);
    process.exit(1);
  });
