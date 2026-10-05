// Split a long PCM WAV into segments the speech API accepts. phc-scribe's /v1/transcribe
// takes at most 10 MB (about 5 minutes of 16 kHz mono), but a visit recording can run
// longer. Segments break on whole samples; a word cut at a boundary is the cost.

export class WavError extends Error {}

type Format = { channels: number; rate: number; bits: number; dataStart: number; dataLength: number };

export function readFormat(buf: Buffer): Format {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new WavError("not a WAV file");
  }
  let fmt: Omit<Format, "dataStart" | "dataLength"> | null = null;
  for (let at = 12; at + 8 <= buf.length; ) {
    const id = buf.toString("ascii", at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    const body = at + 8;
    if (id === "fmt ") {
      if (buf.readUInt16LE(body) !== 1) throw new WavError("only PCM WAV is supported");
      fmt = { channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === "data") {
      if (!fmt) throw new WavError("WAV data before its format");
      return { ...fmt, dataStart: body, dataLength: Math.min(size, buf.length - body) };
    }
    at = body + size + (size % 2); // chunks are padded to an even length
  }
  throw new WavError("WAV has no data");
}

function header(f: Omit<Format, "dataStart" | "dataLength">, dataLength: number): Buffer {
  const h = Buffer.alloc(44);
  const block = f.channels * (f.bits / 8);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + dataLength, 4);
  h.write("WAVEfmt ", 8, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(f.channels, 22);
  h.writeUInt32LE(f.rate, 24);
  h.writeUInt32LE(f.rate * block, 28);
  h.writeUInt16LE(block, 32);
  h.writeUInt16LE(f.bits, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(dataLength, 40);
  return h;
}

/** Segments of at most `maxSeconds` each, every one a valid WAV. A short file comes back as is. */
export function splitWav(buf: Buffer, maxSeconds: number): Buffer[] {
  const f = readFormat(buf);
  const block = f.channels * (f.bits / 8);
  if (block <= 0) throw new WavError("WAV has no samples");
  const step = Math.max(1, Math.floor(maxSeconds * f.rate)) * block;
  if (f.dataLength <= step) return [buf];
  const out: Buffer[] = [];
  for (let off = 0; off < f.dataLength; off += step) {
    const len = Math.min(step, f.dataLength - off);
    out.push(Buffer.concat([header(f, len), buf.subarray(f.dataStart + off, f.dataStart + off + len)]));
  }
  return out;
}
