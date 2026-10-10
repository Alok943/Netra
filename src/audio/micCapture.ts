// Microphone -> 16 kHz mono 16-bit PCM chunks (~100 ms each) for Gemini Live.
// Runs only while a Live session is open.
const WORKLET = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("netra-tap", Tap);
`;

const CHUNK_SAMPLES = 1600; // 100 ms at 16 kHz

export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;

  async start(onChunk: (pcm: Int16Array) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: false,
    });
    this.ctx = new AudioContext({ sampleRate: 16000 });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    try {
      await this.ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "netra-tap");
    let buf = new Int16Array(CHUNK_SAMPLES);
    let n = 0;
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      const f = e.data;
      for (let i = 0; i < f.length; i++) {
        const s = Math.max(-1, Math.min(1, f[i]));
        buf[n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (n === CHUNK_SAMPLES) {
          onChunk(buf);
          buf = new Int16Array(CHUNK_SAMPLES);
          n = 0;
        }
      }
    };
    src.connect(this.node); // not connected to destination: no mic feedback
  }

  stop(): void {
    this.node?.port.close();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.node = null;
    this.stream = null;
    this.ctx = null;
  }
}

/** Asks for mic permission (from the Start flow) so later hands-free starts don't prompt. Throws if refused. */
export async function primeMicPermission(): Promise<void> {
  const s = await navigator.mediaDevices.getUserMedia({ audio: true });
  s.getTracks().forEach((t) => t.stop());
}
