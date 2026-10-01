// Port of phc-scribe serve/phc_scribe/visit_guide.py (ADR-0023 §5). The guide never
// invents questions: items come from the signed-off bundle. Coverage is about whether a
// topic came up ("no bleeding" covers the bleeding question). Unknown contact number or
// gestational age never hides an item.

import type { Facts } from "./facts";
import { fold, hasWord } from "./fold";
import { DEFAULT_ASSERTIONS } from "./rules";
import type { Bundle, GuideItemRaw, GuideStatus } from "./types";

export type GuideItem = {
  id: string;
  group: string;
  ask: string;
  when: "every" | "first" | number;
  concepts: string[];
  terms: string[];
  vitals: string[];
  tests: string[];
  sourceRef: string;
};

export type FollowUp = { id: string; trigger: string; ask: string[]; why: string };

export type Guide = {
  groups: Record<string, string>;
  items: GuideItem[];
  followUps: FollowUp[];
  conceptForms: Map<string, string[]>;
};

const foldTerm = (t: string) => fold(t).trim();

function uniq(xs: string[]): string[] {
  return [...new Set(xs.filter(Boolean))];
}

function toItem(raw: GuideItemRaw): GuideItem {
  const cov = raw.covered_by ?? {};
  const terms = Object.values(cov.terms ?? {}).flatMap((ts) => (ts ?? []).map((t) => foldTerm(String(t))));
  return {
    id: raw.id,
    group: raw.group,
    ask: raw.ask_en,
    when: typeof raw.when === "object" ? raw.when.from_weeks : raw.when,
    concepts: cov.concepts ?? [],
    terms: uniq(terms),
    vitals: cov.vitals ?? [],
    tests: cov.tests ?? [],
    sourceRef: raw.source.ref,
  };
}

export function loadGuide(b: Bundle): Guide {
  const conceptForms = new Map<string, string[]>();
  for (const [c, forms] of Object.entries(b.lexicon.concepts)) {
    conceptForms.set(c, uniq([...(forms.en ?? []), ...(forms.yo ?? [])].map((t) => foldTerm(String(t)))));
  }
  return {
    groups: b.visit_guide.groups,
    items: b.visit_guide.items.map(toItem),
    followUps: (b.visit_guide.follow_ups ?? []).map((f) => ({ id: f.id, trigger: f.if, ask: f.ask, why: f.why_en })),
    conceptForms,
  };
}

export function due(item: GuideItem, firstContact: boolean | null, weeks: number | null): boolean {
  if (item.when === "every") return true;
  if (item.when === "first") return firstContact !== false;
  return weeks === null || weeks >= item.when;
}

export function covered(g: Guide, item: GuideItem, folded: string, f: Facts): boolean {
  if (item.concepts.some((c) => f.findings.has(c))) return true;
  if (item.vitals.some((v) => f.vitals.has(v)) || item.tests.some((t) => f.tests.has(t))) return true;
  const forms = item.concepts.flatMap((c) => g.conceptForms.get(c) ?? []);
  return [...forms, ...item.terms].some((t) => hasWord(folded, t));
}

export function status(g: Guide, transcript: string, f: Facts, firstContact: boolean | null = null, weeks: number | null = null): GuideStatus {
  const folded = fold(transcript);
  const items = g.items.filter((i) => due(i, firstContact, weeks)).map((i) => ({ id: i.id, covered: covered(g, i, folded, f) }));
  const dueIds = new Set(items.map((i) => i.id));
  const coveredIds = new Set(items.filter((i) => i.covered).map((i) => i.id));
  const follow_ups = g.followUps
    .filter((fu) => [...(f.findings.get(fu.trigger) ?? [])].some((a) => DEFAULT_ASSERTIONS.has(a)))
    .map((fu) => ({ id: fu.id, ask: fu.ask.filter((a) => dueIds.has(a) && !coveredIds.has(a)) }))
    .filter((fu) => fu.ask.length > 0);
  return { items, follow_ups };
}
