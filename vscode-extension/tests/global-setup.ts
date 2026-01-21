/**
 * Global setup for extension tests
 * Starts code-server with the extension installed
 */

import { spawn, ChildProcess, execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as net from "net";
import * as os from "os";

declare global {
  var __CODE_SERVER_PROCESS__: ChildProcess | undefined;
  var __CODE_SERVER_PORT__: number;
}

// code-server version to install
const CODE_SERVER_VERSION = "4.102.3";

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        server.close(() => resolve(address.port));
      } else {
        reject(new Error("Could not get port"));
      }
    });
    server.on("error", reject);
  });
}

async function waitForServer(url: string, timeout = 30000): Promise<void> {
  const start = Date.now();
  let delay = 100; // Start with 100ms, use exponential backoff
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 2000); // 100 → 200 → 400 → 800 → 1600 → 2000
  }
  throw new Error(`Server at ${url} did not start within ${timeout}ms`);
}

async function installCodeServer(installDir: string): Promise<void> {
  const arch = os.arch();
  let csArch: string;

  switch (arch) {
    case "x64":
      csArch = "amd64";
      break;
    case "arm64":
      csArch = "arm64";
      break;
    default:
      csArch = arch;
  }

  const url = `https://github.com/coder/code-server/releases/download/v${CODE_SERVER_VERSION}/code-server-${CODE_SERVER_VERSION}-linux-${csArch}.tar.gz`;

  console.log(`⬇️  Downloading code-server from ${url}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-server-"));
  const tarball = path.join(tmpDir, "code-server.tar.gz");

  try {
    // Download using curl
    execSync(`curl -fsSL "${url}" -o "${tarball}"`, { stdio: "inherit" });

    // Extract
    fs.mkdirSync(installDir, { recursive: true });
    execSync(`tar -xz -C "${installDir}" -f "${tarball}" --strip-components=1`, {
      stdio: "inherit",
    });

    console.log(`✅ code-server installed to ${installDir}`);
  } finally {
    // Cleanup temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export default async function globalSetup() {
  console.log("🚀 Starting code-server for extension tests...");

  const projectRoot = path.resolve(__dirname, "../..");
  const asdWorkspace = path.join(projectRoot, ".asd/workspace");
  const codeServerDir = path.join(asdWorkspace, "code/code-server");
  const codeServerBin = path.join(codeServerDir, "bin/code-server");
  const extensionsDir = path.join(asdWorkspace, "code/data/extensions");
  // Dynamically find the latest vsix file
  const vsixFiles = fs.readdirSync(path.join(__dirname, "..")).filter((f) => f.endsWith(".vsix"));
  const extensionVsix =
    vsixFiles.length > 0
      ? path.join(__dirname, "..", vsixFiles.sort().pop()!)
      : path.join(__dirname, "../vscode-caddy-tools-0.1.5.vsix");

  // Check if code-server is installed
  if (!fs.existsSync(codeServerBin)) {
    console.log("📦 code-server not found, installing...");
    await installCodeServer(codeServerDir);
  }

  // Build and package extension if vsix doesn't exist or is older than 1 hour
  const shouldRebuild = (() => {
    if (!fs.existsSync(extensionVsix)) return true;
    const vsixStat = fs.statSync(extensionVsix);
    const ageMs = Date.now() - vsixStat.mtimeMs;
    const oneHourMs = 60 * 60 * 1000;
    return ageMs > oneHourMs;
  })();

  if (shouldRebuild) {
    console.log("📦 Building extension...");
    execSync("npm run build && npm run package", {
      cwd: path.join(__dirname, ".."),
      stdio: "inherit",
    });
  } else {
    console.log("✅ Using cached extension vsix (less than 1 hour old)");
  }

  // Ensure extensions directory exists
  fs.mkdirSync(extensionsDir, { recursive: true });

  // Install extension
  console.log("📦 Installing extension in code-server...");
  try {
    execSync(
      `"${codeServerBin}" --install-extension "${extensionVsix}" --extensions-dir "${extensionsDir}"`,
      {
        stdio: "inherit",
      }
    );
  } catch {
    console.warn("Extension install warning (may already be installed)");
  }

  // Find free port
  const port = await findFreePort();
  globalThis.__CODE_SERVER_PORT__ = port;

  // Write port to file for tests to read
  fs.writeFileSync(path.join(__dirname, ".codeserver-port"), port.toString());

  // Start code-server
  const testWorkspace = path.join(__dirname, "test-files");
  fs.mkdirSync(testWorkspace, { recursive: true });

  // Pre-configure workspace trust to avoid the trust dialog
  const userDataDir = path.join(asdWorkspace, "code/data");
  const userDir = path.join(userDataDir, "User");

  // Clear workspace state to avoid stale cache issues
  const workspaceStorageDir = path.join(userDataDir, "User/workspaceStorage");
  if (fs.existsSync(workspaceStorageDir)) {
    fs.rmSync(workspaceStorageDir, { recursive: true, force: true });
  }

  fs.mkdirSync(userDir, { recursive: true });

  // Write settings to auto-trust the workspace
  const settings = {
    "security.workspace.trust.enabled": false,
    "telemetry.telemetryLevel": "off",
    "workbench.startupEditor": "none",
    "update.showReleaseNotes": false,
    "extensions.autoUpdate": false,
    "explorer.autoReveal": true,
    "files.autoSave": "off",
  };
  fs.writeFileSync(path.join(userDir, "settings.json"), JSON.stringify(settings, null, 2));

  console.log(`🖥️  Starting code-server on port ${port}...`);
  const codeServer = spawn(
    codeServerBin,
    [
      "--bind-addr",
      `127.0.0.1:${port}`,
      "--auth",
      "none",
      "--extensions-dir",
      extensionsDir,
      "--user-data-dir",
      path.join(asdWorkspace, "code/data"),
      testWorkspace,
    ],
    {
      detached: true,
      stdio: "pipe",
      env: {
        ...process.env,
        DISABLE_TELEMETRY: "true",
      },
    }
  );

  globalThis.__CODE_SERVER_PROCESS__ = codeServer;

  // Log output for debugging
  codeServer.stdout?.on("data", (data) => {
    if (process.env.DEBUG) console.log(`[code-server] ${data}`);
  });

  codeServer.stderr?.on("data", (data) => {
    if (process.env.DEBUG) console.error(`[code-server] ${data}`);
  });

  // Wait for server to be ready
  const url = `http://127.0.0.1:${port}`;
  console.log(`⏳ Waiting for code-server at ${url}...`);
  await waitForServer(url);

  console.log(`✅ code-server ready at ${url}`);

  // Store URL for tests
  process.env.CODESERVER_URL = url;
}
