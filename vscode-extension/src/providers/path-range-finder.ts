/**
 * Locates a JSON-path (e.g. "match[0].handler") within raw JSON text as a
 * character-offset range, extracted from diagnostics.ts so it can be
 * unit-tested directly (see src/__tests__/path-range-finder.test.ts) without
 * a `vscode` runtime -- same rationale as schema-validator.ts. Returns plain
 * offsets rather than a `vscode.Range`; CaddyDiagnosticsProvider converts
 * via `document.positionAt()`.
 */

export interface OffsetRange {
  start: number;
  end: number;
}

export function parseJsonPath(path: string): Array<string | number> {
  const segments: Array<string | number> = [];
  const parts = path.split(/\.|\[|\]/);

  for (const part of parts) {
    if (part === "" || part === "$") continue;

    const num = parseInt(part, 10);
    if (!isNaN(num)) {
      segments.push(num);
    } else {
      segments.push(part);
    }
  }

  return segments;
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Finds the character-offset range for a JSON path within raw JSON text. */
export function findPathRangeOffsets(text: string, jsonPath: string): OffsetRange {
  const segments = parseJsonPath(jsonPath);

  if (segments.length === 0) {
    return { start: 0, end: 1 };
  }

  let searchText = text;
  let currentOffset = 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    if (typeof segment === "string") {
      // Property name - find "propertyName":
      const pattern = new RegExp(`"${escapeRegex(segment)}"\\s*:`);
      const match = pattern.exec(searchText);

      if (match) {
        currentOffset += match.index;

        if (i === segments.length - 1) {
          // This is the target property
          return { start: currentOffset, end: currentOffset + match[0].length };
        }

        // Move past this property
        searchText = searchText.slice(match.index + match[0].length);
        currentOffset += match[0].length;
      }
    } else if (typeof segment === "number") {
      // Array index - try to find the Nth item
      let bracketDepth = 0;
      let itemIndex = -1;
      let itemStart = 0;

      for (let j = 0; j < searchText.length; j++) {
        const char = searchText[j];

        if (char === "[" || char === "{") {
          if (bracketDepth === 0 && char === "[") {
            itemIndex = 0;
            itemStart = j + 1;
          }
          bracketDepth++;
        } else if (char === "]" || char === "}") {
          bracketDepth--;
        } else if (char === "," && bracketDepth === 1) {
          itemIndex++;
          itemStart = j + 1;
        }

        if (itemIndex === segment && bracketDepth === 1) {
          currentOffset += itemStart;
          searchText = searchText.slice(itemStart);
          break;
        }
      }
    }
  }

  // Default to first line if not found
  const firstLineEnd = text.indexOf("\n");
  return { start: 0, end: Math.min(firstLineEnd === -1 ? text.length : firstLineEnd, 80) };
}
