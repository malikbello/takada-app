import raw from "./bundle.json";
import { loadGuide } from "./guide";
import type { Bundle } from "./types";

export * from "./facts";
export * from "./fold";
export * from "./guide";
export * from "./rules";
export * from "./types";

/** The vendored clinical bundle (rules, vocabulary, visit guide) from phc-scribe. */
export const BUNDLE = raw as unknown as Bundle;
export const GUIDE = loadGuide(BUNDLE);
export const CONCEPTS = BUNDLE.vocabulary.concepts;
export const CONCEPT_BY_ID = new Map(CONCEPTS.map((c) => [c.id, c]));
