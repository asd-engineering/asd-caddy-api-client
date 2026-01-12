/**
 * VSCode Extension Tests
 *
 * Tests the Caddy Configuration Tools extension running in code-server.
 * These tests verify that the extension works correctly in a real
 * browser-based editor environment.
 */

import {
  test,
  expect,
  waitForEditor,
  openFile,
  handleTrustDialog,
  closeNotifications,
  cleanupEditor,
} from "./fixtures";

test.describe("Caddy Extension - Basic Functionality", () => {
  test.beforeEach(async ({ page, codeServerUrl }) => {
    // Navigate to code-server
    await page.goto(codeServerUrl);

    // Wait for the workbench to load
    await page.waitForSelector(".monaco-workbench", { timeout: 30000 });

    // Handle the workspace trust dialog if present
    await handleTrustDialog(page);

    // Close any notifications and dialogs
    await closeNotifications(page);

    // Cleanup any open editors
    await cleanupEditor(page);

    // Give the UI time to settle
    await page.waitForTimeout(1000);
  });

  test("workbench loads successfully", async ({ page }) => {
    // Verify the main workbench elements are present
    await expect(page.locator(".monaco-workbench")).toBeVisible();
    await expect(page.locator(".statusbar")).toBeVisible();

    // Verify explorer is accessible
    const explorerTab = page.locator('[aria-label*="Explorer"]').first();
    await expect(explorerTab).toBeVisible();
  });

  test("test files are visible in explorer", async ({ page }) => {
    // Check that our test files are visible in the explorer
    const validFile = page.locator('text="valid.caddy.json"').first();
    const invalidFile = page.locator('text="invalid.caddy.json"').first();

    await expect(validFile).toBeVisible({ timeout: 5000 });
    await expect(invalidFile).toBeVisible({ timeout: 5000 });
  });

  test("opens and displays JSON file content", async ({ page }) => {
    // Open the valid.caddy.json test file
    await openFile(page, "valid.caddy.json");

    // Wait for editor to load
    await waitForEditor(page);

    // Verify content is displayed
    const editorContent = page.locator(".view-lines");
    await expect(editorContent).toContainText("reverse_proxy");
    await expect(editorContent).toContainText("example.com");
  });

  test("JSON language mode is set for caddy.json files", async ({ page }) => {
    // Open a caddy.json file
    await openFile(page, "valid.caddy.json");
    await waitForEditor(page);

    // Check the language mode indicator in status bar
    // The selector matches the generic wrapper that has aria-label="JSON" or contains "JSON" text
    const languageMode = page.locator('[aria-label="JSON"], .statusbar :text-is("JSON")').first();
    await expect(languageMode).toBeVisible({ timeout: 5000 });
  });

  test("status bar shows problem count", async ({ page }) => {
    // Check that the status bar has a problems indicator
    const statusBar = page.locator(".statusbar");
    await expect(statusBar).toBeVisible();

    // Look for the problems status bar item (shows 0 or more problems)
    const problemsItem = page.locator('[id="status.problems"], [aria-label*="Problem"]').first();
    await expect(problemsItem).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Caddy Extension - Editor Features", () => {
  test.beforeEach(async ({ page, codeServerUrl }) => {
    await page.goto(codeServerUrl);
    await page.waitForSelector(".monaco-workbench", { timeout: 30000 });
    await handleTrustDialog(page);
    await closeNotifications(page);
    await cleanupEditor(page);
    await page.waitForTimeout(1000);
  });

  test("command palette opens with Ctrl+Shift+P", async ({ page }) => {
    // Try opening command palette
    await page.keyboard.press("Control+Shift+p");
    await page.waitForTimeout(500);

    // Check if quick input appeared
    const quickInput = page.locator(".quick-input-widget").first();
    await expect(quickInput).toBeVisible({ timeout: 5000 });

    // Close it
    await page.keyboard.press("Escape");
  });

  test("quick open works with Ctrl+P", async ({ page }) => {
    // Try opening quick open
    await page.keyboard.press("Control+p");
    await page.waitForTimeout(500);

    // Check if quick input appeared
    const quickInput = page.locator(".quick-input-widget").first();
    await expect(quickInput).toBeVisible({ timeout: 5000 });

    // Close it
    await page.keyboard.press("Escape");
  });

  test("extensions view is accessible", async ({ page }) => {
    // Open extensions view
    await page.keyboard.press("Control+Shift+x");
    await page.waitForTimeout(1000);

    // Check if extensions view is visible
    const extensionsHeading = page.locator('text="Extensions"').first();
    await expect(extensionsHeading).toBeVisible({ timeout: 5000 });
  });
});
