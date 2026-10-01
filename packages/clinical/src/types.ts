// Shapes of the clinical bundle exported by phc-scribe (scripts/export_clinical_bundle.py).

export type Assertion = "present" | "absent" | "possible" | "historical";

export type Condition =
  | { any: Condition[] }
  | { all: Condition[] }
  | { finding: string | { concept: string; assertion?: string[] } }
  | { vital: NumericSpec }
  | { test: NumericSpec };

export type NumericSpec = { name: string; gte?: number; gt?: number; lte?: number; lt?: number; in?: (string | number)[] };

export type RawRule = {
  id: string;
  name: string;
  severity: "urgent_referral" | "refer";
  when: Condition;
  message_en: string;
  source: { ref: string; section?: string; verified?: boolean };
  supersedes?: string[];
};

export type FactsInput = {
  findings?: Record<string, string[]>;
  vitals?: Record<string, number>;
  tests?: Record<string, (number | string)[] | number | string>;
};

export type GuideItemRaw = {
  id: string;
  group: string;
  ask_en: string;
  when: "every" | "first" | { from_weeks: number };
  covered_by: {
    concepts?: string[];
    terms?: Partial<Record<"en" | "yo" | "pcm", string[]>>;
    vitals?: string[];
    tests?: string[];
  };
  source: { ref: string; section?: string; verified?: boolean };
};

export type FollowUpRaw = { id: string; if: string; ask: string[]; why_en: string; source: { ref: string } };

export type Bundle = {
  format: "takada-clinical-bundle";
  format_version: 1;
  status: string;
  content_sha256: string;
  vocabulary: { version: string; concepts: { id: string; label_en: string; danger_sign: boolean; definition: string }[] };
  rules: {
    version: string;
    sources: Record<string, { title: string; verified?: boolean }>;
    severities: Record<string, string>;
    rules: RawRule[];
  };
  lexicon: { version: string; concepts: Record<string, { en?: string[]; yo?: string[] }> };
  visit_guide: {
    version: string;
    sources: Record<string, { title: string }>;
    groups: Record<string, string>;
    items: GuideItemRaw[];
    follow_ups?: FollowUpRaw[];
  };
  vectors: {
    fold: { in: string; out: string }[];
    rules: { facts: FactsInput; flags: string[] }[];
    guide: { transcript: string; facts: FactsInput; first_contact: boolean | null; weeks: number | null; expect: GuideStatus }[];
  };
};

export type GuideStatus = {
  items: { id: string; covered: boolean }[];
  follow_ups: { id: string; ask: string[] }[];
};
