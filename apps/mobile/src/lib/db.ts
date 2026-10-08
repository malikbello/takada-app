// On-device store (IndexedDB via Dexie). The event log is the source of truth on the
// phone; visits are computed from it. `synced` marks events the hub or cloud has
// acknowledged, so nothing is ever deleted before it is safely elsewhere.

import Dexie, { type Table } from "dexie";
import type { VisitEvent } from "@takada/protocol";

export type StoredEvent = VisitEvent & { synced: 0 | 1 };
export type StoredBlob = { id: string; visitId: string; blob: Blob; createdAt: string; uploaded: 0 | 1 };
export type Setting = { key: string; value: string };
/** A recording in progress: its chunks are saved as they arrive, so a crash loses seconds, not the visit. */
export type OpenRecording = { id: string; visitId: string; deviceId: string; worker: string; mime: string; startedAt: string };
export type Chunk = { id?: number; recId: string; seq: number; blob: Blob };

export class TakadaDB extends Dexie {
  events!: Table<StoredEvent, string>;
  blobs!: Table<StoredBlob, string>;
  settings!: Table<Setting, string>;
  recordings!: Table<OpenRecording, string>;
  chunks!: Table<Chunk, number>;

  constructor(name = "takada") {
    super(name);
    this.version(1).stores({
      events: "id, visitId, at, synced, type",
      blobs: "id, visitId, uploaded",
      settings: "key",
    });
    this.version(2).stores({ recordings: "id, visitId", chunks: "++id, recId, [recId+seq]" });
  }
}

export const db = new TakadaDB();
