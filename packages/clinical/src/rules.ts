// Port of phc-scribe serve/phc_scribe/rules.py (ADR-0003: rules decide, the model only
// documents). Missing data never matches; "possible" counts the same as "present"
// (safety first). Every golden test in the bundle runs against this port in CI.

import type { Facts } from "./facts";
import type { Condition, NumericSpec, RawRule } from "./types";

export const DEFAULT_ASSERTIONS = new Set(["present", "possible"]);
const SEVERITY_ORDER: Record<string, number> = { urgent_referral: 0, refer: 1 };
const CMP: Record<string, (a: number, b: number) => boolean> = {
  gte: (a, b) => a >= b,
  gt: (a, b) => a > b,
  lte: (a, b) => a <= b,
  lt: (a, b) => a < b,
};

export type Flag = {
  ruleId: string;
  name: string;
  severity: RawRule["severity"];
  message: string;
  sourceRef: string;
  sourceSection: string;
};

function valueMatches(spec: NumericSpec, value: number | string): boolean {
  for (const [op, target] of Object.entries(spec)) {
    if (op === "name") continue;
    if (op === "in") {
      if (!(target as (string | number)[]).includes(value)) return false;
      continue;
    }
    const cmp = CMP[op];
    if (!cmp) throw new Error(`unknown comparator ${op}`);
    if (typeof value === "string" || !cmp(value, target as number)) return false;
  }
  return true;
}

export function matches(cond: Condition, f: Facts): boolean {
  if ("any" in cond) return cond.any.some((c) => matches(c, f));
  if ("all" in cond) return cond.all.every((c) => matches(c, f));
  if ("finding" in cond) {
    const spec = cond.finding;
    const concept = typeof spec === "string" ? spec : spec.concept;
    const wanted = typeof spec === "string" || !spec.assertion ? DEFAULT_ASSERTIONS : new Set(spec.assertion);
    const have = f.findings.get(concept);
    return !!have && [...have].some((a) => wanted.has(a));
  }
  if ("vital" in cond) {
    const v = f.vitals.get(cond.vital.name);
    return v !== undefined && valueMatches(cond.vital, v);
  }
  if ("test" in cond) return (f.tests.get(cond.test.name) ?? []).some((v) => valueMatches(cond.test, v));
  throw new Error(`unknown condition ${JSON.stringify(cond)}`);
}

/** Fired rules, minus superseded ones, most severe first (ties by rule id). */
export function evaluate(rules: RawRule[], f: Facts): Flag[] {
  const fired = rules.filter((r) => matches(r.when, f));
  const superseded = new Set(fired.flatMap((r) => r.supersedes ?? []));
  return fired
    .filter((r) => !superseded.has(r.id))
    .map((r) => ({
      ruleId: r.id,
      name: r.name,
      severity: r.severity,
      message: r.message_en,
      sourceRef: r.source.ref,
      sourceSection: r.source.section ?? "",
    }))
    .sort((a, b) => (SEVERITY_ORDER[a.severity]! - SEVERITY_ORDER[b.severity]!) || (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0));
}
