export type NumberSegment = {
  id: string;
  string: string;
  kind: "digit" | "symbol";
};

let nextNewId = 0;

function classifyKind(char: string): NumberSegment["kind"] {
  return /[0-9]/.test(char) ? "digit" : "symbol";
}

/**
 * Segments a string into per-character NumberSegments.
 *
 * When `cursorIndex` is provided, uses position-based matching:
 * characters before the edit keep their old IDs by position,
 * characters after the edit keep theirs offset by the length change.
 *
 * When `cursorIndex` is not provided, falls back to greedy forward
 * matching (works well for distinct characters).
 */
export function segmentNumber(
  value: string,
  prevSegments?: NumberSegment[],
  cursorIndex?: number,
): NumberSegment[] {
  const chars = value.split("");

  if (!prevSegments || prevSegments.length === 0) {
    return simpleSegment(chars);
  }

  const oldChars = prevSegments.map((s) =>
    s.string === "\u00A0" ? " " : s.string,
  );

  const matches =
    cursorIndex != null
      ? cursorMatch(oldChars, chars, cursorIndex)
      : greedyMatch(oldChars, chars);

  const usedIds = new Set<string>();
  for (const [, oldIdx] of matches) {
    usedIds.add(prevSegments[oldIdx]!.id);
  }

  const result: NumberSegment[] = [];

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i]!;
    const kind = classifyKind(char);
    const displayChar = char === " " ? "\u00A0" : char;

    if (matches.has(i)) {
      const oldIdx = matches.get(i)!;
      result.push({
        id: prevSegments[oldIdx]!.id,
        string: displayChar,
        kind,
      });
    } else {
      let id = `${char}_n${nextNewId++}`;
      while (usedIds.has(id)) {
        id = `${char}_n${nextNewId++}`;
      }
      usedIds.add(id);
      result.push({ id, string: displayChar, kind });
    }
  }

  return result;
}

/** Occurrence-based segmentation for initial render. */
function simpleSegment(chars: string[]): NumberSegment[] {
  const counts = new Map<string, number>();

  return chars.map((char) => {
    const kind = classifyKind(char);
    const count = counts.get(char) ?? 0;
    counts.set(char, count + 1);

    if (char === " ") {
      return {
        id: count > 0 ? `space_${count}` : "space",
        string: "\u00A0",
        kind,
      };
    }

    return {
      id: count > 0 ? `${char}_${count}` : char,
      string: char,
      kind,
    };
  });
}

/**
 * Position-based matching using cursor position.
 * The cursor in the NEW string tells us where the edit happened:
 * - Insertion: chars were added just before cursor. Prefix [0, cursor-inserted)
 *   maps 1:1, suffix [cursor, end) maps to old [cursor-inserted, end).
 * - Deletion: chars were removed. Prefix [0, cursor) maps 1:1,
 *   suffix [cursor, end) maps to old [cursor+deleted, end).
 */
function cursorMatch(
  oldChars: string[],
  newChars: string[],
  cursor: number,
): Map<number, number> {
  const matches = new Map<number, number>();
  const lenDiff = newChars.length - oldChars.length;

  if (lenDiff > 0) {
    const editStart = cursor - lenDiff;
    for (let i = 0; i < editStart && i < oldChars.length; i++) {
      matches.set(i, i);
    }
    for (let i = cursor; i < newChars.length; i++) {
      const oldIdx = i - lenDiff;
      if (oldIdx >= 0 && oldIdx < oldChars.length) {
        matches.set(i, oldIdx);
      }
    }
  } else if (lenDiff < 0) {
    for (let i = 0; i < cursor && i < newChars.length; i++) {
      matches.set(i, i);
    }
    for (let i = cursor; i < newChars.length; i++) {
      const oldIdx = i - lenDiff;
      if (oldIdx >= 0 && oldIdx < oldChars.length) {
        matches.set(i, oldIdx);
      }
    }
  } else {
    for (let i = 0; i < newChars.length; i++) {
      if (newChars[i] === oldChars[i]) {
        matches.set(i, i);
      }
    }
  }

  return matches;
}

/**
 * Greedy forward matching: matches each old character to the earliest
 * available position in the new string. Fallback when no cursor info.
 *
 * Returns a Map of newIndex → oldIndex for matched characters.
 */
function greedyMatch(
  oldChars: string[],
  newChars: string[],
): Map<number, number> {
  const matches = new Map<number, number>();
  let newStart = 0;

  for (let i = 0; i < oldChars.length; i++) {
    for (let j = newStart; j < newChars.length; j++) {
      if (oldChars[i] === newChars[j]) {
        matches.set(j, i);
        newStart = j + 1;
        break;
      }
    }
  }

  return matches;
}
