// On-device store (IndexedDB via Dexie). The event log is the source of truth on the
// phone; visits are computed from it. `synced` marks events the hub or cloud has
// acknowledged, so nothing is ever deleted before it is safely elsewhere.

import Dexie, { type Table } from "dexie";
import type { VisitEvent } from "@takada/protocol";

export type StoredEvent = VisitEvent & { synced: 0 | 1 };
export type StoredBlob = { id: string; visitId: string; blob: Blob; createdAt: string; uploaded: 0 | 1 };
export type Setting = { key: string; value: string };

export class TakadaDB extends Dexie {
  events!: Table<StoredEvent, string>;
  blobs!: Table<StoredBlob, string>;
  settings!: Table<Setting, string>;

  constructor(name = "takada") {
    super(name);
    this.version(1).stores({
      events: "id, visitId, at, synced, type",
      blobs: "id, visitId, uploaded",
      settings: "key",
    });
  }
}

export const db = new TakadaDB();
