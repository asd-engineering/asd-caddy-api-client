/**
 * MITMweb integration for traffic inspection
 */
import { spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import type { MitmwebOptions, MitmwebStatus } from "../types.js";
import { MitmwebOptionsSchema } from "../schemas.js";
import { MitmproxyNotInstalledError, MitmproxyStartError, CaddyApiClientError } from "../errors.js";

/**
 * Check if mitmproxy is installed
 * @returns True if mitmweb is available
 */
export async function isMitmproxyInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("which", ["mitmweb"]);
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });
}

/**
 * Get mitmproxy version
 * @returns Version string
 */
export async function getMitmproxyVersion(): Promise<string | null> {
  if (!(await isMitmproxyInstalled())) {
    return null;
  }

  return new Promise((resolve) => {
    const proc = spawn("mitmweb", ["--version"]);
    let output = "";

    proc.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        // Extract version from output (e.g., "mitmproxy 10.1.6")
        const match = /(\d+\.\d+\.\d+)/.exec(output);
        resolve(match ? match[1] : null);
      } else {
        resolve(null);
      }
    });

    proc.on("error", () => resolve(null));
  });
}

/**
 * Start mitmweb proxy
 * @param options - Mitmweb configuration
 * @returns Process information
 */
export async function startMitmweb(options: MitmwebOptions = {}): Promise<{
  pid: number;
  webUrl: string;
  proxyUrl: string;
  pidFile: string;
}> {
  const validated = MitmwebOptionsSchema.parse(options);

  // Check if mitmproxy is installed
  if (!(await isMitmproxyInstalled())) {
    throw new MitmproxyNotInstalledError(
      "MITMproxy is not installed. Install with: pip install mitmproxy"
    );
  }

  // Check if already running
  const status = getMitmwebStatus(validated.workingDir);
  if (status.running) {
    throw new CaddyApiClientError("MITMweb is already running", { pid: status.pid });
  }

  // Build command arguments
  const args: string[] = [
    "--web-port",
    validated.webPort.toString(),
    "--listen-port",
    validated.proxyPort.toString(),
    "--listen-host",
    validated.listenAddress,
    "--no-web-open-browser", // We'll handle browser opening ourselves
  ];

  // Add custom scripts
  if (validated.scripts && validated.scripts.length > 0) {
    for (const script of validated.scripts) {
      args.push("-s", script);
    }
  }

  // Spawn mitmweb process
  const proc = spawn("mitmweb", args, {
    detached: true,
    stdio: "ignore",
  });

  // Save PID file
  const workingDir = validated.workingDir ?? process.cwd();
  const pidFile = join(workingDir, "mitmweb.pid");
  writeFileSync(pidFile, proc.pid!.toString(), "utf-8");

  // Unref to allow parent process to exit
  proc.unref();

  // Wait for mitmweb to be ready
  await waitForMitmweb(validated.webPort, 10000);

  // Open browser if requested
  if (validated.openBrowser) {
    const webUrl = `http://${validated.listenAddress}:${validated.webPort}`;
    openBrowser(webUrl);
  }

  return {
    pid: proc.pid!,
    webUrl: `http://${validated.listenAddress}:${validated.webPort}`,
    proxyUrl: `http://${validated.listenAddress}:${validated.proxyPort}`,
    pidFile,
  };
}

/**
 * Stop mitmweb proxy
 * @param workingDir - Working directory (to find PID file)
 */
export async function stopMitmweb(workingDir?: string): Promise<void> {
  const status = getMitmwebStatus(workingDir);

  if (!status.running || !status.pid) {
    return; // Already stopped
  }

  // Kill process
  try {
    process.kill(status.pid, "SIGTERM");

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        try {
          process.kill(status.pid!, 0); // Check if process exists
        } catch {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        try {
          process.kill(status.pid!, "SIGKILL"); // Force kill
        } catch {
          // Process already dead
        }
        resolve();
      }, 5000);
    });
  } catch {
    // Process already dead
  }

  // Remove PID file
  const dir = workingDir ?? process.cwd();
  const pidFile = join(dir, "mitmweb.pid");
  if (existsSync(pidFile)) {
    unlinkSync(pidFile);
  }
}

/**
 * Get mitmweb status
 * @param workingDir - Working directory (to find PID file)
 * @returns Status information
 */
export function getMitmwebStatus(workingDir?: string): MitmwebStatus {
  const dir = workingDir ?? process.cwd();
  const pidFile = join(dir, "mitmweb.pid");

  if (!existsSync(pidFile)) {
    return { running: false };
  }

  try {
    const pidStr = readFileSync(pidFile, "utf-8").trim();
    const pid = parseInt(pidStr, 10);

    if (isNaN(pid)) {
      return { running: false };
    }

    // Check if process is running
    try {
      process.kill(pid, 0); // Signal 0 checks if process exists
      return {
        running: true,
        pid,
        webUrl: "http://127.0.0.1:8081", // Default values
        proxyUrl: "http://127.0.0.1:8080",
      };
    } catch {
      // Process not running
      unlinkSync(pidFile); // Clean up stale PID file
      return { running: false };
    }
  } catch {
    return { running: false };
  }
}

/**
 * Wait for mitmweb to be ready
 * @param port - Web UI port
 * @param timeout - Timeout in milliseconds
 */
async function waitForMitmweb(port: number, timeout: number): Promise<void> {
  const startTime = Date.now();
  const url = `http://127.0.0.1:${port}`;

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return; // Mitmweb is ready
      }
    } catch {
      // Not ready yet
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new MitmproxyStartError("Mitmweb failed to start within timeout");
}

/**
 * Open URL in default browser
 * @param url - URL to open
 */
function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;

  if (platform === "darwin") {
    command = "open";
  } else if (platform === "win32") {
    command = "start";
  } else {
    command = "xdg-open";
  }

  spawn(command, [url], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

/**
 * Auto-install mitmproxy using pipx (recommended) or pip
 * @returns True if installation successful
 */
export async function autoInstallMitmproxy(): Promise<boolean> {
  // Try pipx first (isolated installation)
  const pipxInstalled = await new Promise<boolean>((resolve) => {
    const proc = spawn("which", ["pipx"]);
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });

  if (pipxInstalled) {
    console.log("Installing mitmproxy with pipx...");
    const result = await new Promise<boolean>((resolve) => {
      const proc = spawn("pipx", ["install", "mitmproxy"], {
        stdio: "inherit",
      });
      proc.on("close", (code) => resolve(code === 0));
      proc.on("error", () => resolve(false));
    });

    if (result) {
      console.log("✅ MITMproxy installed successfully");
      return true;
    }
  }

  // Fall back to pip
  console.log("Installing mitmproxy with pip...");
  const result = await new Promise<boolean>((resolve) => {
    const proc = spawn("pip", ["install", "--user", "mitmproxy"], {
      stdio: "inherit",
    });
    proc.on("close", (code) => resolve(code === 0));
    proc.on("error", () => resolve(false));
  });

  if (result) {
    console.log("✅ MITMproxy installed successfully");
    return true;
  }

  console.error("❌ Failed to install mitmproxy");
  return false;
}
