// Plays 24 kHz mono PCM from Gemini Live as it streams in. stop() cuts audio instantly (danger / barge-in).
import { base64ToInt16 } from "./pcm";

export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();

  constructor(private onIdle?: () => void) {}

  get playing(): boolean {
    return this.sources.size > 0;
  }

  /** Create the context from a user gesture so Chrome allows autoplay later. */
  async unlock(): Promise<void> {
    this.ctx ??= new AudioContext({ sampleRate: 24000 });
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  enqueue(b64: string): void {
    if (!this.ctx) return;
    const pcm = base64ToInt16(b64);
    const buf = this.ctx.createBuffer(1, pcm.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    const at = Math.max(this.ctx.currentTime + 0.02, this.nextTime);
    src.start(at);
    this.nextTime = at + buf.duration;
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      if (this.sources.size === 0) this.onIdle?.();
    };
  }

  stop(): void {
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    const was = this.sources.size > 0;
    this.sources.clear();
    this.nextTime = 0;
    if (was) this.onIdle?.();
  }

  close(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
  }
}
