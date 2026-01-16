/**
 * Global teardown for extension tests
 * Stops code-server process
 */

import * as path from "path";
import * as fs from "fs";

export default async function globalTeardown() {
  console.log("🛑 Stopping code-server...");

  // Clean up port file
  const portFile = path.join(__dirname, ".codeserver-port");
  if (fs.existsSync(portFile)) {
    fs.unlinkSync(portFile);
  }

  // Kill code-server process
  const codeServer = globalThis.__CODE_SERVER_PROCESS__;
  if (codeServer && codeServer.pid) {
    try {
      // Kill process group to ensure all child processes are terminated
      process.kill(-codeServer.pid, "SIGTERM");
    } catch {
      // Process may have already exited
      try {
        process.kill(codeServer.pid, "SIGTERM");
      } catch {
        // Ignore errors if process is already gone
      }
    }
  }

  console.log("✅ code-server stopped");
}
