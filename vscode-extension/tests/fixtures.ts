/**
 * Playwright test fixtures for code-server extension testing
 */

import { test as base, expect, Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

/**
 * Custom test fixture that provides code-server URL
 */
export const test = base.extend<{
  codeServerUrl: string;
}>({
  codeServerUrl: async ({}, use) => {
    // Read port from file written by global setup
    const portFile = path.join(__dirname, ".codeserver-port");
    if (!fs.existsSync(portFile)) {
      throw new Error("code-server port file not found. Did global setup run?");
    }

    const port = fs.readFileSync(portFile, "utf-8").trim();
    const url = `http://127.0.0.1:${port}`;

    await use(url);
  },
});

export { expect };

/**
 * Helper to dismiss the workspace trust dialog if present
 */
export async function handleTrustDialog(page: Page): Promise<void> {
  // Try multiple times with increasing waits
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Look for "Yes, I trust the authors" button and click it
      const trustButton = page.locator('button:has-text("Yes, I trust the authors")');
      await trustButton.waitFor({ state: "visible", timeout: 3000 });
      await trustButton.click();
      await page.waitForTimeout(500);
      console.log("Trust dialog dismissed");
      return;
    } catch {
      // Trust dialog not visible yet, wait a bit
      await page.waitForTimeout(500);
    }
  }
  // Trust dialog not present after all attempts, continue
}

/**
 * Helper to close any notification dialogs
 */
export async function closeNotifications(page: Page): Promise<void> {
  try {
    // Close notification toasts by pressing Escape or clicking X
    const closeButtons = page.locator(
      '.notification-toast .codicon-close, .notifications-center .action-item[title="Clear"]'
    );
    const count = await closeButtons.count();
    for (let i = 0; i < count; i++) {
      try {
        await closeButtons.nth(i).click({ timeout: 500 });
      } catch {
        // Button may have disappeared
      }
    }
  } catch {
    // No notifications present
  }

  // Press Escape multiple times to close any dialogs/quick picks
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  }
}

/**
 * Helper to cleanup open editors and dialogs
 */
export async function cleanupEditor(page: Page): Promise<void> {
  // Press Escape multiple times to close any quick picks or dialogs
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  }

  // Close all open editors
  try {
    await page.keyboard.press("Control+k");
    await page.keyboard.press("Control+w");
    await page.waitForTimeout(300);
  } catch {
    // May fail if no editors open
  }
}

/**
 * Helper to wait for Monaco editor to be fully loaded
 */
export async function waitForEditor(page: Page): Promise<void> {
  // Wait for the Monaco editor to be present
  await page.waitForSelector(".monaco-editor", { timeout: 30000 });

  // Wait for editor to be interactive
  await page.waitForFunction(
    () => {
      const editor = document.querySelector(".monaco-editor");
      return editor && !editor.classList.contains("loading");
    },
    { timeout: 30000 }
  );

  // Small delay for editor initialization
  await page.waitForTimeout(1000);
}

/**
 * Helper to create a new file in the editor
 */
export async function createFile(
  page: Page,
  filename: string,
  content: string = ""
): Promise<void> {
  // Use keyboard shortcut to create new file
  await page.keyboard.press("Control+n");
  await waitForEditor(page);

  // Type content if provided
  if (content) {
    await page.keyboard.type(content, { delay: 10 });
  }

  // Save with specific name using Ctrl+S which opens Save As for new files
  await page.keyboard.press("Control+s");

  // Wait for the Save As dialog (Quick Input in code-server)
  try {
    // code-server uses a quick input for Save As
    const quickInput = page.locator(".quick-input-box input, input.input[aria-label]").first();
    await quickInput.waitFor({ state: "visible", timeout: 5000 });

    // Clear any existing text and type filename
    await quickInput.fill(filename);
    await page.keyboard.press("Enter");
  } catch {
    // Try the standard input selector
    const input = page.locator('input[type="text"]').first();
    if (await input.isVisible({ timeout: 2000 })) {
      await input.fill(filename);
      await page.keyboard.press("Enter");
    }
  }

  // Wait for file to be saved
  await page.waitForTimeout(1000);
}

/**
 * Helper to open an existing file
 */
export async function openFile(page: Page, filename: string): Promise<void> {
  // Use quick open (Ctrl+P)
  await page.keyboard.press("Control+p");

  // Wait for quick input
  const quickInput = page.locator(".quick-input-box input");
  await quickInput.waitFor({ state: "visible", timeout: 5000 });

  // Type filename
  await quickInput.fill(filename);
  await page.waitForTimeout(500);

  // Wait for results to appear and select the first match
  const resultItem = page.locator(`[role="option"]:has-text("${filename}")`).first();
  try {
    await resultItem.waitFor({ state: "visible", timeout: 3000 });
    await resultItem.click();
  } catch {
    // Fall back to pressing Enter
    await page.keyboard.press("Enter");
  }

  await waitForEditor(page);
}

/**
 * Helper to trigger autocomplete
 */
export async function triggerCompletion(page: Page): Promise<void> {
  await page.keyboard.press("Control+Space");
  // Wait for completion list to appear
  await page.waitForSelector(".monaco-list.suggest-widget", { timeout: 5000 });
}

/**
 * Helper to trigger hover
 */
export async function triggerHover(page: Page, text: string): Promise<void> {
  // Find the text in the editor and hover over it
  const editorContent = page.locator(".view-lines");
  const textSpan = editorContent.locator(`text="${text}"`).first();

  if (await textSpan.isVisible()) {
    await textSpan.hover();
    // Wait for hover widget
    await page.waitForSelector(".monaco-hover", { timeout: 5000 });
  }
}

/**
 * Helper to check for diagnostic markers
 */
export async function hasDiagnostics(page: Page): Promise<boolean> {
  // Check for error/warning squiggles
  const squiggles = page.locator(".squiggly-error, .squiggly-warning");
  return (await squiggles.count()) > 0;
}

/**
 * Helper to open command palette
 */
export async function openCommandPalette(page: Page): Promise<void> {
  await page.keyboard.press("F1");
  await page.waitForSelector(".quick-input-box input", { timeout: 5000 });
}

/**
 * Helper to run a command from command palette
 */
export async function runCommand(page: Page, command: string): Promise<void> {
  await openCommandPalette(page);
  await page.keyboard.type(command);
  await page.waitForTimeout(300); // Wait for filtering
  await page.keyboard.press("Enter");
}
