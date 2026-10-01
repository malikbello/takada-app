import { canonical, sha256Hex } from "./hash";
import { VisitEvent } from "./events";

type Unhashed = Omit<VisitEvent, "hash" | "id" | "at"> & { id?: string; at?: string };

/** Create a validated, hashed event. Throws on anything the schema rejects: no silent bad data. */
export async function makeEvent(e: Unhashed): Promise<VisitEvent> {
  const draft = { ...e, id: e.id ?? crypto.randomUUID(), at: e.at ?? new Date().toISOString() };
  const hash = await sha256Hex(canonical(draft));
  return VisitEvent.parse({ ...draft, hash });
}

/** True if the event's hash matches its content (detects tampering or corruption in transit). */
export async function verifyEvent(e: VisitEvent): Promise<boolean> {
  const { hash, ...rest } = e;
  return (await sha256Hex(canonical(rest))) === hash;
}
