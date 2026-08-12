/**
 * Direct unit tests for scripts/check-changelog-structure.ts (0.10 priority
 * 7) -- see that file's doc comment for the incident that prompted it and
 * an honest note on what it can/can't catch.
 */
import { describe, test, expect, afterEach } from "vitest";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { checkChangelogStructure } from "../../scripts/check-changelog-structure.js";

const dir = mkdtempSync(join(tmpdir(), "changelog-structure-test-"));
let currentFile: string | undefined;

function writeChangelog(content: string): string {
  currentFile = join(dir, `${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  writeFileSync(currentFile, content);
  return currentFile;
}

afterEach(() => {
  if (currentFile) {
    unlinkSync(currentFile);
    currentFile = undefined;
  }
});

describe("checkChangelogStructure", () => {
  test("a well-formed changelog (both header styles) passes with no errors", () => {
    const file = writeChangelog(
      [
        "# Changelog",
        "",
        "## [0.10.0](https://example.com/compare/v0.9.0...v0.10.0) (2026-08-12)",
        "",
        "### Added",
        "- Something",
        "",
        "## [0.9.0](https://example.com/compare/v0.8.0...v0.9.0) (2026-08-11)",
        "",
        "## [0.3.0] - 2026-01-09",
        "",
      ].join("\n")
    );
    expect(checkChangelogStructure(file)).toEqual([]);
  });

  test("catches a duplicate version", () => {
    const file = writeChangelog(
      ["## [0.10.0] - 2026-08-12", "## [0.10.0] - 2026-08-11"].join("\n")
    );
    const errors = checkChangelogStructure(file);
    expect(errors.some((e) => e.includes("duplicates"))).toBe(true);
  });

  test("catches an out-of-order (increasing) version", () => {
    const file = writeChangelog(["## [0.9.0] - 2026-08-11", "## [0.10.0] - 2026-08-12"].join("\n"));
    const errors = checkChangelogStructure(file);
    expect(errors.some((e) => e.includes("versions must strictly decrease"))).toBe(true);
  });

  test("catches a compare-link whose target disagrees with the header's own version", () => {
    const file = writeChangelog(
      "## [0.9.0](https://example.com/compare/v0.8.0...v0.9.9) (2026-08-11)"
    );
    const errors = checkChangelogStructure(file);
    expect(errors.some((e) => e.includes("compare-link targets"))).toBe(true);
  });

  test("catches an invalid date", () => {
    const file = writeChangelog("## [0.9.0] - 2026-13-45");
    const errors = checkChangelogStructure(file);
    expect(errors.some((e) => e.includes("not a valid YYYY-MM-DD date"))).toBe(true);
  });

  test("catches an invalid semver version", () => {
    const file = writeChangelog("## [not-a-version] - 2026-08-11");
    const errors = checkChangelogStructure(file);
    expect(errors.some((e) => e.includes("not a valid x.y.z semver version"))).toBe(true);
  });

  test("allows two entries with the same date (legitimate same-day releases)", () => {
    const file = writeChangelog(["## [0.9.0] - 2026-08-11", "## [0.8.0] - 2026-08-11"].join("\n"));
    expect(checkChangelogStructure(file)).toEqual([]);
  });

  test("reports an error if the file has no version headers at all", () => {
    const file = writeChangelog("# Changelog\n\nNothing here yet.\n");
    const errors = checkChangelogStructure(file);
    expect(errors.some((e) => e.includes("no"))).toBe(true);
  });

  test("the real CHANGELOG.md and vscode-extension/CHANGELOG.md both pass", () => {
    expect(checkChangelogStructure("CHANGELOG.md")).toEqual([]);
    expect(checkChangelogStructure("vscode-extension/CHANGELOG.md")).toEqual([]);
  });
});
