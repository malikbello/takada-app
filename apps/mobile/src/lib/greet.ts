// Greeting by time of day, in Yorùbá with English underneath.
export function greeting(d = new Date()): { yo: string; en: string } {
  const h = d.getHours();
  if (h < 12) return { yo: "Ẹ kú àárọ̀", en: "Good morning" };
  if (h < 16) return { yo: "Ẹ kú ọ̀sán", en: "Good afternoon" };
  return { yo: "Ẹ kú alẹ́", en: "Good evening" };
}
