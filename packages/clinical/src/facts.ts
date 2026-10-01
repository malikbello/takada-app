import type { FactsInput } from "./types";

/** What the rules and guide can see: asserted findings, numeric vitals, lab results. */
export type Facts = {
  findings: Map<string, Set<string>>;
  vitals: Map<string, number>;
  tests: Map<string, (number | string)[]>;
};

export function facts(input: FactsInput = {}): Facts {
  const tests = new Map<string, (number | string)[]>();
  for (const [k, v] of Object.entries(input.tests ?? {})) tests.set(k, Array.isArray(v) ? v : [v]);
  return {
    findings: new Map(Object.entries(input.findings ?? {}).map(([k, v]) => [k, new Set(v)])),
    vitals: new Map(Object.entries(input.vitals ?? {}).map(([k, v]) => [k, Number(v)])),
    tests,
  };
}
