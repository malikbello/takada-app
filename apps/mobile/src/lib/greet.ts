// Greetings in the health worker's own language (chosen at sign-in, changeable in
// Settings). Spoken, merged forms ("Ẹ káalẹ́", not "Ẹ kú alẹ́"), as people actually greet.
// DRAFT: tone marks and the Hausa/Igbo/Pidgin forms need a native speaker's check.

export type Lang = "yo" | "ha" | "ig" | "pcm" | "en";
export const LANGS: [Lang, string][] = [["yo", "Yorùbá"], ["ha", "Hausa"], ["ig", "Igbo"], ["pcm", "Pidgin"], ["en", "English"]];

type Part = "morning" | "afternoon" | "evening";
const G: Record<Lang, Record<Part, string>> = {
  yo: { morning: "Ẹ káàárọ̀", afternoon: "Ẹ káàsán", evening: "Ẹ káalẹ́" },
  ha: { morning: "Barka da safiya", afternoon: "Barka da rana", evening: "Barka da yamma" },
  ig: { morning: "Ụtụtụ ọma", afternoon: "Ehihie ọma", evening: "Mgbede ọma" },
  pcm: { morning: "Good morning o", afternoon: "Good afternoon o", evening: "Good evening o" },
  en: { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" },
};
const WELCOME: Record<Lang, string> = { yo: "Ẹ káàbọ̀", ha: "Barka da zuwa", ig: "Nnọọ", pcm: "You don come", en: "Welcome" };

export function part(d = new Date()): Part {
  const h = d.getHours();
  return h < 12 ? "morning" : h < 16 ? "afternoon" : "evening";
}

/** The local greeting, plus the English one shown underneath when the language isn't English. */
export function greeting(lang: Lang = "yo", d = new Date()): { local: string; en: string | null } {
  const p = part(d);
  return { local: G[lang][p], en: lang === "en" ? null : G.en[p] };
}

export const welcome = (lang: Lang) => WELCOME[lang];
