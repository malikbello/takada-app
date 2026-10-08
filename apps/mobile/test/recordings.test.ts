import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/lib/db";
import { finishRecording, openRecording, recoverRecordings, saveChunk } from "../src/lib/recordings";
import { append, saveProfile, visitEvents } from "../src/lib/store";

// Stand-in for the browser's decoder: the "WAV" is the joined chunks, one second per chunk.
const convert = async (b: Blob) => ({ wav: new Blob([await b.arrayBuffer()], { type: "audio/wav" }), seconds: (await b.text()).length });

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function visitWithRecording(chunks: string[]) {
  const p = await saveProfile("Nurse A", "PHC-1");
  const visitId = crypto.randomUUID();
  await append({ visitId, deviceId: p.deviceId, worker: p.worker, type: "visit.started", payload: { facility: "PHC-1", patientRef: "ANC-1", language: "yo", firstContact: null, weeks: 30 } });
  const recId = await openRecording({ visitId, deviceId: p.deviceId, worker: p.worker, mime: "audio/webm" });
  // chunks can land out of order; seq decides
  for (const [i, c] of [...chunks.entries()].reverse()) await saveChunk(recId, i, new Blob([c]));
  return { visitId, recId };
}

describe("crash-safe recording", () => {
  it("after the app was killed mid-recording, the next start saves the recording to its visit", async () => {
    const { visitId, recId } = await visitWithRecording(["a", "b", "c"]);
    // ... app killed here: no Stop, nothing converted ...
    expect(await recoverRecordings(convert)).toEqual({ recovered: 1, failed: 0 });
    const blob = await db.blobs.get(recId);
    expect(await blob!.blob.text()).toBe("abc"); // every chunk, in order
    const audio = (await visitEvents(visitId)).filter((e) => e.type === "audio.captured");
    expect(audio).toHaveLength(1);
    expect(audio[0]!.payload).toMatchObject({ blobId: recId, seconds: 3 });
    expect(await db.chunks.count()).toBe(0);
    expect(await db.recordings.count()).toBe(0);
  });

  it("finishing twice (Stop, then a crash during clean-up) saves the audio once", async () => {
    const { visitId, recId } = await visitWithRecording(["a", "b"]);
    await finishRecording(recId, convert);
    await db.recordings.put({ id: recId, visitId, deviceId: "d", worker: "w", mime: "audio/webm", startedAt: new Date().toISOString() });
    await recoverRecordings(convert);
    expect((await visitEvents(visitId)).filter((e) => e.type === "audio.captured")).toHaveLength(1);
    expect(await db.blobs.count()).toBe(1);
  });

  it("keeps the chunks when the audio cannot be decoded, and reports it", async () => {
    const { recId } = await visitWithRecording(["x"]);
    const broken = async () => { throw new Error("cannot decode"); };
    expect(await recoverRecordings(broken)).toEqual({ recovered: 0, failed: 1 });
    expect(await db.chunks.where("recId").equals(recId).count()).toBe(1);
    expect(await recoverRecordings(convert)).toEqual({ recovered: 1, failed: 0 }); // a later start succeeds
  });

  it("a recording with no audio at all leaves nothing behind", async () => {
    const { visitId } = await visitWithRecording([]);
    expect(await recoverRecordings(convert)).toEqual({ recovered: 0, failed: 0 });
    expect((await visitEvents(visitId)).some((e) => e.type === "audio.captured")).toBe(false);
    expect(await db.recordings.count()).toBe(0);
  });
});
