// What a failed draft means for the nurse, in plain words, with what to do next. The hub
// sends "<code>: <technical detail>"; the code decides the message, and the detail stays
// available for the supervisor (shown small, under the message).

const MESSAGES: Record<string, string> = {
  silent_audio: "No speech could be heard in the recording. Check that nothing covers the phone's microphone, hold it nearer, then record again or type notes.",
  nothing_to_draft: "There is nothing to draft yet. Record the visit or add a note first.",
  audio_missing: "A recording did not reach the hub. Stay on the clinic Wi-Fi, then tap Draft again.",
  visit_missing: "The hub has not received this visit yet. Stay on the clinic Wi-Fi, then tap Draft again.",
  audio_invalid: "A recording could not be read. Record that part again, or type notes.",
  upstream_unreachable: "The AI on the hub is not answering. Ask your supervisor to check the hub, then tap Draft again. You can finish the visit by hand meanwhile.",
  upstream_413: "This visit is too long to draft in one go. Ask your supervisor to update the hub.",
  upstream_429: "The hub is busy. Wait a minute, then tap Draft again.",
  upstream_401: "The hub's AI is not set up correctly. Ask your supervisor.",
  upstream_403: "The hub's AI is not set up correctly. Ask your supervisor.",
};

export function jobMessage(error: string | null | undefined): { message: string; detail: string | null } {
  if (!error) return { message: "Drafting failed. Tap Draft again, or finish the visit by hand.", detail: null };
  const code = error.split(":")[0]!.trim();
  const known = MESSAGES[code] ?? (/^upstream_5\d\d$/.test(code) ? "The AI on the hub ran into a problem. Tap Draft again; if it keeps failing, finish the visit by hand and tell your supervisor." : null);
  return { message: known ?? "Drafting failed. Tap Draft again, or finish the visit by hand.", detail: error };
}
