import type { DatabaseSync } from "node:sqlite";
import { flagsOf, reduce, type Visit, type VisitEvent } from "@takada/protocol";

export function insertEvent(db: DatabaseSync, e: VisitEvent, facility: string): boolean {
  const r = db
    .prepare("INSERT OR IGNORE INTO events (id, visit_id, facility, device_id, type, at, body, received_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(e.id, e.visitId, facility, e.deviceId, e.type, e.at, JSON.stringify(e), new Date().toISOString());
  return Number(r.changes) > 0;
}

export function visitFacility(db: DatabaseSync, visitId: string): string | null {
  const row = db.prepare("SELECT facility FROM visits WHERE id = ?").get(visitId) as { facility: string } | undefined;
  return row?.facility ?? null;
}

export function claimVisit(db: DatabaseSync, visitId: string, facility: string): void {
  db.prepare("INSERT OR IGNORE INTO visits (id, facility) VALUES (?, ?)").run(visitId, facility);
}

export function eventsForVisit(db: DatabaseSync, visitId: string): VisitEvent[] {
  return (db.prepare("SELECT body FROM events WHERE visit_id = ? ORDER BY seq").all(visitId) as { body: string }[]).map((r) => JSON.parse(r.body));
}

export function visit(db: DatabaseSync, visitId: string): Visit | null {
  return reduce(eventsForVisit(db, visitId));
}

export function priorityOf(v: Visit | null): number {
  if (!v) return 0;
  const flags = flagsOf(v);
  return flags.some((f) => f.severity === "urgent_referral") ? 20 : flags.length ? 10 : 0;
}
