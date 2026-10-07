// Speech recognition upstream takes 16 kHz mono PCM WAV. Converting on the phone keeps
// the hub free of codecs (no ffmpeg) and makes uploads deterministic.

export function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** Decode any recorded format and resample to 16 kHz mono WAV. The decoder resamples to the
 * context's 16 kHz rate itself, so a long visit never sits in memory at 48 kHz (a 20-minute
 * stereo recording would be about 460 MB of samples; at 16 kHz mono it is about 77 MB). */
export async function toWav16k(blob: Blob): Promise<{ wav: Blob; seconds: number }> {
  const rate = 16000;
  const ctx = new AudioContext({ sampleRate: rate });
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    let mono = decoded.getChannelData(0);
    if (decoded.numberOfChannels > 1) {
      const mixed = new Float32Array(decoded.length);
      for (let c = 0; c < decoded.numberOfChannels; c++) {
        const ch = decoded.getChannelData(c);
        for (let i = 0; i < ch.length; i++) mixed[i]! += ch[i]! / decoded.numberOfChannels;
      }
      mono = mixed;
    }
    return { wav: encodeWav(mono, decoded.sampleRate), seconds: decoded.duration };
  } finally {
    await ctx.close();
  }
}
