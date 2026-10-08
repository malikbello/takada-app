// Crash-safe recording. Each chunk MediaRecorder delivers (every second) is written to
// IndexedDB at once; Stop joins them into the visit's WAV. If the app is killed, the phone
// restarts or the battery dies mid-visit, the next start finishes the recording from the saved
// chunks, so at most the last second is lost. The recording's id is also its audio's id, so
// finishing one twice is harmless.

import { db, type OpenRecording } from "./db";
import { append } from "./store";
import { toWav16k } from "./wav";

type Convert = (b: Blob) => Promise<{ wav: Blob; seconds: number }>;

export async function openRecording(r: Omit<OpenRecording, "id" | "startedAt">): Promise<string> {
  const id = crypto.randomUUID();
  await db.recordings.put({ ...r, id, startedAt: new Date().toISOString() });
  return id;
}

export async function saveChunk(recId: string, seq: number, blob: Blob): Promise<void> {
  await db.chunks.put({ recId, seq, blob });
}

/** Turn a recording's saved chunks into the visit's audio. Returns its length in seconds, or
 * null if there was nothing to save. Throws if the audio cannot be decoded (chunks are kept). */
export async function finishRecording(recId: string, convert: Convert = toWav16k): Promise<number | null> {
  const rec = await db.recordings.get(recId);
  if (!rec) return null;
  const chunks = await db.chunks.where("recId").equals(recId).sortBy("seq");
  const already = await db.blobs.get(recId);
  let seconds: number | null = null;
  if (!already && chunks.length) {
    const out = await convert(new Blob(chunks.map((c) => c.blob), { type: rec.mime }));
    seconds = out.seconds;
    await db.blobs.put({ id: recId, visitId: rec.visitId, blob: out.wav, createdAt: rec.startedAt, uploaded: 0 });
  }
  const blob = already ?? (await db.blobs.get(recId));
  if (blob) {
    const logged = await db.events.where("visitId").equals(rec.visitId)
      .filter((e) => e.type === "audio.captured" && (e.payload as { blobId?: string }).blobId === recId).count();
    if (!logged) {
      await append({ visitId: rec.visitId, deviceId: rec.deviceId, worker: rec.worker, type: "audio.captured",
        payload: { blobId: recId, seconds: Math.round(seconds ?? blob.blob.size / 32_000), mime: "audio/wav" } });
    }
  }
  await db.transaction("rw", db.chunks, db.recordings, async () => {
    await db.chunks.where("recId").equals(recId).delete();
    await db.recordings.delete(recId);
  });
  return seconds;
}

/** At start-up: finish every recording a crash left open. Returns how many were recovered and
 * any that could not be decoded (their chunks stay on the phone). One run at a time. */
let recovering: Promise<{ recovered: number; failed: number }> | null = null;
export function recoverRecordings(convert: Convert = toWav16k): Promise<{ recovered: number; failed: number }> {
  return (recovering ??= recoverAll(convert).finally(() => (recovering = null)));
}

async function recoverAll(convert: Convert): Promise<{ recovered: number; failed: number }> {
  let recovered = 0, failed = 0;
  for (const r of await db.recordings.toArray()) {
    try {
      if ((await finishRecording(r.id, convert)) !== null) recovered++;
    } catch {
      failed++;
    }
  }
  return { recovered, failed };
}
