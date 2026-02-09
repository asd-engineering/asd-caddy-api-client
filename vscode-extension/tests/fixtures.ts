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
  // Quick check for trust dialog with shorter timeout
  try {
    const trustButton = page.locator('button:has-text("Yes, I trust the authors")');
    await trustButton.waitFor({ state: "visible", timeout: 2000 });
    await trustButton.click();
    // Wait for dialog to close
    await trustButton.waitFor({ state: "hidden", timeout: 1000 }).catch(() => {});
    console.log("Trust dialog dismissed");
  } catch {
    // Trust dialog not present, continue
  }
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
        await closeButtons.nth(i).click({ timeout: 300 });
      } catch {
        // Button may have disappeared
      }
    }
  } catch {
    // No notifications present
  }

  // Press Escape to close any dialogs/quick picks (batched, no waits)
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
}

/**
 * Helper to dismiss any modal dialogs (save dialogs, etc.)
 */
async function dismissDialogs(page: Page): Promise<void> {
  const modalBlock = page.locator(".monaco-dialog-modal-block");
  if (await modalBlock.isVisible({ timeout: 100 }).catch(() => false)) {
    // Try "Don't Save" button first
    const dontSaveButton = page.locator('button:has-text("Don\'t Save")').first();
    if (await dontSaveButton.isVisible({ timeout: 100 }).catch(() => false)) {
      await dontSaveButton.click();
      await modalBlock.waitFor({ state: "hidden", timeout: 1000 }).catch(() => {});
      return;
    }
    // Press Escape as fallback
    await page.keyboard.press("Escape");
  }
}

/**
 * Helper to close all editors, handling "Don't Save" dialogs
 */
export async function closeAllEditors(page: Page): Promise<void> {
  // Dismiss any existing dialogs first
  await dismissDialogs(page);

  // Press Escape to close quick picks
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Close all editors - loop until no tabs remain
  for (let attempt = 0; attempt < 5; attempt++) {
    const tabs = page.locator('[role="tab"]');
    const tabCount = await tabs.count().catch(() => 0);
    if (tabCount === 0) break;

    // Close all editors shortcut
    await page.keyboard.press("Control+k");
    await page.keyboard.press("Control+w");

    // Handle save dialog if it appears
    await dismissDialogs(page);
  }
}

/**
 * Helper to cleanup open editors and dialogs
 */
export async function cleanupEditor(page: Page): Promise<void> {
  await closeAllEditors(page);
}

/**
 * Helper to wait for Monaco editor to be fully loaded
 */
export async function waitForEditor(page: Page): Promise<void> {
  // Wait for the Monaco editor to be present
  await page.waitForSelector(".monaco-editor", { timeout: 30000 });

  // Wait for editor to be interactive (includes cursor line visible)
  await page.waitForFunction(
    () => {
      const editor = document.querySelector(".monaco-editor");
      const cursorLine = document.querySelector(".monaco-editor .cursor");
      return editor && !editor.classList.contains("loading") && cursorLine;
    },
    { timeout: 30000 }
  );
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

  // Wait for file to be saved by checking tab title loses the dot indicator
  await page
    .waitForFunction(
      (fn) => {
        const tab = document.querySelector(`[role="tab"][aria-label*="${fn}"]`);
        return tab && !tab.getAttribute("aria-label")?.includes("●");
      },
      filename,
      { timeout: 5000 }
    )
    .catch(() => {});
}

/**
 * Helper to open an existing file
 */
export async function openFile(page: Page, filename: string): Promise<void> {
  // Dismiss any blocking dialogs
  await dismissDialogs(page);

  // First try to find and click the file in the explorer using exact aria-label match
  const fileInExplorer = page.locator(`.monaco-list-row[aria-label="${filename}"]`).first();
  if (await fileInExplorer.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fileInExplorer.dblclick();
    await waitForEditor(page);
    return;
  }

  // If not visible in explorer, try expanding the folder first
  const folderItem = page.locator('.monaco-list-row:has-text("test-files")').first();
  if (await folderItem.isVisible({ timeout: 1000 }).catch(() => false)) {
    const twistie = folderItem.locator(".twistie").first();
    if (await twistie.isVisible({ timeout: 500 }).catch(() => false)) {
      await twistie.click();
      // Wait for folder to expand by checking for children
      await page
        .waitForFunction(() => document.querySelectorAll(".monaco-list-row").length > 1, {
          timeout: 2000,
        })
        .catch(() => {});
    }

    // Try again to find the file with exact aria-label match
    const fileAfterExpand = page.locator(`.monaco-list-row[aria-label="${filename}"]`).first();
    if (await fileAfterExpand.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fileAfterExpand.dblclick();
      await waitForEditor(page);
      return;
    }

    // Try partial match as fallback (must start with filename)
    const filePartial = page.locator(`.monaco-list-row[aria-label^="${filename}"]`).first();
    if (await filePartial.isVisible({ timeout: 1000 }).catch(() => false)) {
      await filePartial.dblclick();
      await waitForEditor(page);
      return;
    }
  }

  // Fall back to quick open (Ctrl+P)
  await page.keyboard.press("Control+p");
  const quickInput = page.locator(".quick-input-box input");
  await quickInput.waitFor({ state: "visible", timeout: 5000 });

  // Type filename and wait for results to appear
  await quickInput.fill(filename);
  await page
    .waitForFunction(() => document.querySelectorAll('[role="option"]').length > 0, {
      timeout: 3000,
    })
    .catch(() => {});

  // Wait for exact match first, then any result
  const exactMatch = page.locator(`[role="option"]:has-text("${filename}")`).first();
  if (await exactMatch.isVisible({ timeout: 2000 }).catch(() => false)) {
    await exactMatch.click();
  } else {
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
  // Wait for filtering by checking for options
  await page
    .waitForFunction(
      () => document.querySelectorAll('.quick-input-list [role="option"]').length > 0,
      { timeout: 3000 }
    )
    .catch(() => {});
  await page.keyboard.press("Enter");
}
