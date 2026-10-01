// Port of phc-scribe serve/phc_scribe/text.py `fold` (text only, no offsets). Matching
// runs on folded text: tone marks and dots below removed, lower case, whitespace runs
// collapsed, curly quotes and dashes mapped to ASCII. The clinical bundle's `fold`
// vectors (computed by the Python reference) pin this to the same output.

const PUNCT: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
};

const COMBINING = /\p{M}/gu;
const SPACE = /\s/u;

export function fold(text: string): string {
  let out = "";
  for (const raw of text) {
    if (SPACE.test(raw)) {
      if (out.endsWith(" ")) continue;
      out += " ";
      continue;
    }
    const ch = PUNCT[raw] ?? raw;
    out += ch.normalize("NFD").replace(COMBINING, "").normalize("NFC").toLowerCase();
  }
  return out;
}

const WORD = "[\\p{L}\\p{N}_]";

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word occurrence of an already-folded term in folded text. */
export function hasWord(folded: string, term: string): boolean {
  if (!term) return false;
  return new RegExp(`(?<!${WORD})${escape(term)}(?!${WORD})`, "u").test(folded);
}
