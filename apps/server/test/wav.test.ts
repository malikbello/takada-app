import { describe, expect, it } from "vitest";
import { isSilent, readFormat, splitWav, WavError } from "../src/wav";
import { pcmWav } from "./helpers";

const API_LIMIT = 10_000_000; // phc-scribe /v1/transcribe

describe("splitWav", () => {
  it("returns a short recording unchanged", () => {
    const w = pcmWav(30);
    const out = splitWav(w, 240);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(w); // the same buffer (a deep compare of 1 MB timed out under load)
  });

  it("splits a 10-minute visit into valid segments under the API limit, losing no audio", () => {
    const w = pcmWav(600);
    const segs = splitWav(w, 240);
    expect(segs.map((s) => readFormat(s).dataLength / 32_000)).toEqual([240, 240, 120]);
    for (const s of segs) {
      expect(s.length).toBeLessThan(API_LIMIT);
      expect(readFormat(s)).toMatchObject({ channels: 1, rate: 16_000, bits: 16, dataStart: 44 });
    }
    const joined = Buffer.concat(segs.map((s) => s.subarray(44)));
    expect(joined.equals(w.subarray(44))).toBe(true);
  });

  it("finds the data after extra chunks (e.g. LIST metadata)", () => {
    const w = pcmWav(1);
    const list = Buffer.alloc(8 + 5 + 1); // odd size, padded
    list.write("LIST", 0, "ascii");
    list.writeUInt32LE(5, 4);
    const withList = Buffer.concat([w.subarray(0, 36), list, w.subarray(36)]);
    expect(readFormat(withList).dataStart).toBe(44 + list.length);
    expect(readFormat(withList).dataLength).toBe(32_000);
  });

  it("refuses files that are not PCM WAV", () => {
    expect(() => readFormat(Buffer.from("not a wav file at all"))).toThrow(WavError);
    const header = Buffer.alloc(64);
    header.write("RIFF", 0, "ascii");
    header.write("WAVE", 8, "ascii");
    expect(() => readFormat(header)).toThrow(WavError);
    const float = pcmWav(1);
    float.writeUInt16LE(3, 20); // IEEE float
    expect(() => readFormat(float)).toThrow(/only PCM/);
  });
});

describe("isSilent", () => {
  it("tells a muted microphone from a recording with sound", () => {
    const quiet = pcmWav(2);
    quiet.fill(0, 44);
    expect(isSilent(quiet)).toBe(true);
    for (let i = 44; i < quiet.length; i += 2) quiet.writeInt16LE(((i / 2) % 9) - 4, i); // hiss, about -80 dBFS
    expect(isSilent(quiet)).toBe(true);
    expect(isSilent(pcmWav(2))).toBe(false);
  });
});
