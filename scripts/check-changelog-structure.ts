/**
 * Structural sanity check for CHANGELOG.md files (0.10 priority 7).
 *
 * Born from a real incident this session: a corrupted concurrent-session
 * edit inserted a description of a fix that actually shipped in 0.10.0 into
 * the historical `[0.3.0]` section, and altered that section's date in the
 * process (2026-01-09 -> 2026-01-11, coincidentally colliding with the next
 * entry's date). Nothing caught it -- it was found by hand while writing a
 * changelog entry for something else.
 *
 * This is deliberately NOT a "is this changelog semantically true" checker
 * (that's not mechanically verifiable) -- just structural consistency:
 *  - every version header parses as valid semver and a valid date
 *  - versions strictly decrease top-to-bottom (also catches duplicates)
 *  - dates are non-increasing top-to-bottom (same-day releases are fine and
 *    genuinely happen in this project's history -- e.g. 0.8.0 and 0.9.0 were
 *    both dated 2026-08-11 -- so ties are allowed; an entry just can't be
 *    dated *after* something listed above it)
 *  - a header's own compare-link (when present) points at its own version
 *
 * Honest limitation, found while verifying this script against the real
 * incident: the exact date corruption above (2026-01-09 -> 2026-01-11) is
 * NOT caught by date-ordering alone, since the corrupted date happened to
 * tie with the entry above it rather than exceed it, and ties are allowed
 * for the legitimate same-day-release reason. What this script reliably
 * catches is the broader, more common category of the same underlying
 * problem: a version header that's duplicated, out of order, or whose
 * compare-link disagrees with its own version -- verified by hand against
 * four synthetic corruptions of this exact file before trusting it.
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
    console.error(
      "\nThis usually means a changelog entry landed under the wrong version, or a " +
        "historical entry got edited by mistake (see scripts/check-changelog-structure.ts's " +
        "own doc comment for the incident that prompted this check)."
    );
    process.exit(1);
  }

  console.log("✓ CHANGELOG structure check passed");
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  void main();
}
