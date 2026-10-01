import { canonical, sha256Hex } from "./hash";
import { VisitEvent } from "./events";

// Per-device monotonic clock: two events made in the same millisecond still get
// strictly increasing timestamps, so their order on replay is the order they happened.
let lastMs = 0;
export function nextTimestamp(now = Date.now()): string {
  lastMs = Math.max(now, lastMs + 1);
  return new Date(lastMs).toISOString();
}

type Unhashed = Omit<VisitEvent, "hash" | "id" | "at"> & { id?: string; at?: string };

/** Create a validated, hashed event. Throws on anything the schema rejects: no silent bad data. */
export async function makeEvent(e: Unhashed): Promise<VisitEvent> {
  const draft = { ...e, id: e.id ?? crypto.randomUUID(), at: e.at ?? nextTimestamp() };
  const hash = await sha256Hex(canonical(draft));
  return VisitEvent.parse({ ...draft, hash });
}

/** True if the event's hash matches its content (detects tampering or corruption in transit). */
export async function verifyEvent(e: VisitEvent): Promise<boolean> {
  const { hash, ...rest } = e;
  return (await sha256Hex(canonical(rest))) === hash;
}
