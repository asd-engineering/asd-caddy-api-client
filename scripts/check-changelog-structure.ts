/**
 * Structural sanity check for CHANGELOG.md files: version headers parse as
 * valid semver/dates, versions strictly decrease top-to-bottom (also
 * catches duplicates), dates are non-increasing top-to-bottom (ties allowed
 * for same-day releases), and a header's compare-link matches its own
 * version. Not a "is this changelog semantically true" checker -- just
 * structural consistency. Known gap: a corrupted date that happens to tie
 * with a neighboring entry, rather than exceed it, isn't caught.
 *
 * Run standalone: `npx tsx scripts/check-changelog-structure.ts [files...]`
 * (defaults to CHANGELOG.md and vscode-extension/CHANGELOG.md). Wired into
 * scripts/check-changelog.sh, which husky's pre-commit hook already runs.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

interface ParsedHeader {
  line: number;
  raw: string;
  version: string;
  date: string;
  /** The version segment after "..." in a standard-version compare link, if the header has one. */
  linkTargetVersion?: string;
}

const HEADER_WITH_LINK = /^## \[([^\]]+)\]\(([^)]+)\)\s*\(([^)]+)\)\s*$/;
const HEADER_WITHOUT_LINK = /^## \[([^\]]+)\]\s*-\s*(.+)\s*$/;

function parseHeaders(content: string): ParsedHeader[] {
  const headers: ParsedHeader[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const withLink = HEADER_WITH_LINK.exec(line);
    if (withLink) {
      const [, version, link, date] = withLink;
      const targetMatch = /\.\.\.v?([^/]+)$/.exec(link);
      headers.push({
        line: i + 1,
        raw: line,
        version,
        date,
        linkTargetVersion: targetMatch?.[1],
      });
      continue;
    }
    const withoutLink = HEADER_WITHOUT_LINK.exec(line);
    if (withoutLink) {
      const [, version, date] = withoutLink;
      headers.push({ line: i + 1, raw: line, version, date });
    }
  }

  return headers;
}

function parseSemver(version: string): [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
}

export function checkChangelogStructure(filePath: string): string[] {
  const content = readFileSync(filePath, "utf-8");
  const headers = parseHeaders(content);
  const errors: string[] = [];

  if (headers.length === 0) {
    errors.push(`${filePath}: no "## [x.y.z] ..." headers found -- is the format still expected?`);
    return errors;
  }

  let previous: ParsedHeader | undefined;

  for (const header of headers) {
    const loc = `${filePath}:${header.line}`;

    const semver = parseSemver(header.version);
    if (!semver) {
      errors.push(`${loc}: "${header.version}" is not a valid x.y.z semver version.`);
    }

    if (!isValidDate(header.date)) {
      errors.push(`${loc}: "${header.date}" is not a valid YYYY-MM-DD date.`);
    }

    if (header.linkTargetVersion && header.linkTargetVersion !== header.version) {
      errors.push(
        `${loc}: compare-link targets "${header.linkTargetVersion}" but the header's own ` +
          `version is "${header.version}" -- they should match.`
      );
    }

    if (previous && semver) {
      const previousSemver = parseSemver(previous.version);
      if (previousSemver) {
        const cmp = compareSemver(semver, previousSemver);
        if (cmp === 0) {
          errors.push(
            `${loc}: version "${header.version}" duplicates the entry at ` +
              `${filePath}:${previous.line}.`
          );
        } else if (cmp > 0) {
          errors.push(
            `${loc}: version "${header.version}" is newer than the entry above it ` +
              `("${previous.version}" at ${filePath}:${previous.line}) -- versions must strictly ` +
              `decrease top-to-bottom.`
          );
        }
      }
      if (isValidDate(header.date) && isValidDate(previous.date) && header.date > previous.date) {
        errors.push(
          `${loc}: date "${header.date}" is later than the entry above it ` +
            `("${previous.date}" at ${filePath}:${previous.line}) -- dates must be non-increasing ` +
            `top-to-bottom.`
        );
      }
    }

    previous = header;
  }

  return errors;
}

async function main() {
  const files = process.argv.slice(2);
  const targets = files.length > 0 ? files : ["CHANGELOG.md", "vscode-extension/CHANGELOG.md"];

  let allErrors: string[] = [];
  for (const file of targets) {
    allErrors = allErrors.concat(checkChangelogStructure(file));
  }

  if (allErrors.length > 0) {
    console.error("CHANGELOG structure check failed:\n");
    for (const error of allErrors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  console.log("✓ CHANGELOG structure check passed");
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  void main();
}
