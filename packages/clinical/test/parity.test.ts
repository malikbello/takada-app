import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUNDLE, GUIDE, evaluate, facts, fold, status } from "../src";

// The bundle's vectors were computed by phc-scribe's Python reference implementation.
// Any divergence in this port fails here, before it can reach a phone.

describe("clinical bundle", () => {
  it("is the exact file pinned in bundle.sha256", () => {
    const bytes = readFileSync(new URL("../src/bundle.json", import.meta.url));
    const pinned = readFileSync(new URL("../src/bundle.sha256", import.meta.url), "utf8").trim();
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(pinned);
    expect(BUNDLE.format).toBe("takada-clinical-bundle");
    expect(BUNDLE.format_version).toBe(1);
  });

  it("folds text exactly like the Python reference", () => {
    for (const v of BUNDLE.vectors.fold) expect(fold(v.in)).toBe(v.out);
  });

  it("fires exactly the rules the Python engine fires on every golden test", () => {
    expect(BUNDLE.vectors.rules.length).toBeGreaterThan(20);
    for (const v of BUNDLE.vectors.rules) {
      expect(evaluate(BUNDLE.rules.rules, facts(v.facts)).map((f) => f.ruleId)).toEqual(v.flags);
    }
  });

  it("computes the same visit-guide status as the Python reference", () => {
    for (const v of BUNDLE.vectors.guide) {
      expect(status(GUIDE, v.transcript, facts(v.facts), v.first_contact, v.weeks)).toEqual(v.expect);
    }
  });
});
