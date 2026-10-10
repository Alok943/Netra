// "gemini_live" handler: natural Hindi/English voice conversation.
//
// Flow (https://ai.google.dev/gemini-api/docs/live and /ephemeral-tokens):
//   1. POST /api/gemini-token -> { token, model }. Single use, must connect within 60 s. The token is locked
//      server-side to our model, AUDIO output and system prompt, so the browser cannot change them.
//   2. Browser: new GoogleGenAI({ apiKey: token, apiVersion v1beta }).live.connect(...).
//   3. Audio in: 16-bit PCM, 16 kHz, streamed from the mic only while a session is open.
//   4. Video in: JPEG frames at 1 fps, ONLY while a session is open (cost + privacy).
//   5. Audio out: 16-bit PCM, 24 kHz, played as it streams.
//   6. interrupt(): stop playback immediately when a danger reflex fires.
//   7. After the model finishes a turn the session stays open for a follow-up window, then closes.
import type { Session } from "@google/genai";
import { micHub } from "../audio/micHub";
import { blobToBase64, int16ToBase64 } from "../audio/pcm";
import { PcmPlayer } from "../audio/pcmPlayer";
import { CONFIG } from "../config";

/**
 * `processing` starts as soon as the service has heard the user. It is deliberately
 * separate from `listening`: without it, a person cannot tell whether they should
 * keep talking or wait for the answer.
 */
export type LiveState = "off" | "connecting" | "listening" | "processing" | "speaking";

export interface LiveSessionOptions {
  language: "en" | "hi";
  /** Optional opening user text, e.g. the transcript that triggered the route */
  initialText?: string;
  /** Returns the current camera frame as a JPEG; called about once per second while the session is open */
  getFrame?: () => Promise<Blob | null>;
  onState?: (state: LiveState) => void;
  /** Called with each piece of text as it is transcribed, for the on-screen status line */
  onTranscript?: (who: "user" | "netra", text: string) => void;
  onError?: (err: unknown) => void;
  /** Called once when the session has fully closed (follow-up window ended, error, or stop()) */
  onClosed?: () => void;
}

export interface LiveHandler {
  readonly active: boolean;
  start(opts: LiveSessionOptions): Promise<void>;
  sendFrame(jpeg: Blob): void;
  sendAudio(pcm16k: Int16Array): void;
  /** Cut off any speech in progress. Called by the danger reflex path. */
  interrupt(): void;
  stop(): Promise<void>;
}

export async function fetchEphemeralToken(): Promise<{ token: string; model: string; expireTime: string }> {
  const res = await fetch("/api/gemini-token", { method: "POST" });
  if (!res.ok) throw new Error(`token request failed: ${res.status}`);
  return res.json();
}

const FRAME_INTERVAL_MS = 1000;
/** How long the session waits for a follow-up question after Netra finishes speaking. */
const FOLLOW_UP_MS = 7000;
/** Give up if nothing at all is heard or said this long after opening. */
const FIRST_TURN_MS = 7000;

export class GeminiLive implements LiveHandler {
  active = false;

  private session: Session | null = null;
  private stopMic: (() => void) | null = null;
  private player = new PcmPlayer(() => this.onPlaybackIdle());
  private opts: LiveSessionOptions | null = null;
  private frameTimer: ReturnType<typeof setInterval> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private frameBusy = false;
  private modelTurnDone = true;
  private state: LiveState = "off";
  private generation = 0;
  /** After a danger interrupt, drop the rest of the current answer instead of replaying it. */
  private suppressAudio = false;

  /** Call from a user gesture (Start button) so audio playback is allowed later without one. */
  async unlockAudio(): Promise<void> {
    await this.player.unlock();
  }

  async start(opts: LiveSessionOptions): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.opts = opts;
    const gen = ++this.generation;
    this.setState("connecting");
    try {
      const [{ token, model }, { GoogleGenAI }] = await Promise.all([fetchEphemeralToken(), import("@google/genai")]);
      if (gen !== this.generation) return;
      await this.player.unlock();

      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: CONFIG.liveApiVersion } });
      const session = await ai.live.connect({
        model,
        // The token locks the real config; this only mirrors it so the client and server agree.
        config: { responseModalities: ["AUDIO" as never] },
        callbacks: {
          onmessage: (m) => this.onMessage(gen, m),
          onerror: (e) => {
            if (gen !== this.generation) {
              console.warn("[live] error from an old session ignored", e);
              return;
            }
            this.opts?.onError?.(e);
            void this.stop();
          },
          onclose: () => {
            if (gen === this.generation) void this.stop();
          },
        },
      });
      if (gen !== this.generation) {
        session.close();
        return;
      }
      this.session = session;

      this.stopMic = await micHub.subscribe((pcm) => this.sendAudio(pcm));
      if (gen !== this.generation) return;

      // The first picture goes out before anything else. Without it the model would answer from the text hint alone
      // (frames otherwise start a second later), and a wrong detector guess would come straight back as the answer.
      await this.sendFirstFrame(session, opts);
      if (gen !== this.generation) return;
      if (opts.initialText) session.sendRealtimeInput({ text: opts.initialText });
      this.startFrames();
      this.setState("listening");
      this.armIdle(FIRST_TURN_MS);
    } catch (err) {
      if (gen === this.generation) {
        opts.onError?.(err);
        await this.stop();
      }
    }
  }

  private async sendFirstFrame(session: Session, opts: LiveSessionOptions): Promise<void> {
    try {
      const jpeg = await opts.getFrame?.();
      if (!jpeg) return;
      const data = await blobToBase64(jpeg);
      session.sendRealtimeInput({ video: { data, mimeType: "image/jpeg" } });
    } catch (err) {
      console.warn("[live] first frame not sent", err);
    }
  }

  sendFrame(jpeg: Blob): void {
    const session = this.session;
    if (!session) return;
    void blobToBase64(jpeg).then((data) => {
      if (this.session === session) session.sendRealtimeInput({ video: { data, mimeType: "image/jpeg" } });
    });
  }

  sendAudio(pcm16k: Int16Array): void {
    this.session?.sendRealtimeInput({ audio: { data: int16ToBase64(pcm16k), mimeType: "audio/pcm;rate=16000" } });
  }

  interrupt(): void {
    if (this.active && !this.modelTurnDone) this.suppressAudio = true;
    this.player.stop();
  }

  async stop(): Promise<void> {
    if (!this.active && !this.session) return;
    this.generation++;
    this.active = false;
    if (this.frameTimer) clearInterval(this.frameTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.frameTimer = this.idleTimer = null;
    this.stopMic?.();
    this.stopMic = null;
    this.player.stop();
    try {
      this.session?.close();
    } catch {
      /* already closed */
    }
    this.session = null;
    const opts = this.opts;
    this.opts = null;
    this.setState("off");
    opts?.onClosed?.();
  }

  private setState(next: LiveState): void {
    if (next === this.state) return;
    this.state = next;
    this.opts?.onState?.(next);
  }

  private onMessage(gen: number, m: import("@google/genai").LiveServerMessage): void {
    if (gen !== this.generation) return;
    const sc = m.serverContent;
    if (!sc) return;

    if (sc.interrupted) {
      this.player.stop(); // user spoke over Netra
      this.suppressAudio = false;
      this.setState("listening");
    }
    for (const part of sc.modelTurn?.parts ?? []) {
      const data = part.inlineData?.data;
      if (data && !this.suppressAudio) {
        this.modelTurnDone = false;
        this.player.enqueue(data);
        this.setState("speaking");
        this.clearIdle();
      }
    }
    if (sc.inputTranscription?.text) {
      this.opts?.onTranscript?.("user", sc.inputTranscription.text);
      this.setState("processing");
      this.clearIdle();
    }
    if (sc.outputTranscription?.text) this.opts?.onTranscript?.("netra", sc.outputTranscription.text);
    if (sc.turnComplete) {
      this.modelTurnDone = true;
      this.suppressAudio = false;
      if (!this.player.playing) this.onPlaybackIdle();
    }
  }

  /** Playback drained: if the model is also finished, start the follow-up window. */
  private onPlaybackIdle(): void {
    if (!this.active || !this.modelTurnDone) return;
    this.setState("listening");
    this.armIdle(FOLLOW_UP_MS);
  }

  private armIdle(ms: number): void {
    this.clearIdle();
    this.idleTimer = setTimeout(() => void this.stop(), ms);
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private startFrames(): void {
    const getFrame = this.opts?.getFrame;
    if (!getFrame) return;
    const sendNextFrame = async () => {
      if (this.frameBusy) return;
      this.frameBusy = true;
      try {
        const jpeg = await getFrame();
        if (jpeg) this.sendFrame(jpeg);
      } finally {
        this.frameBusy = false;
      }
    };
    // A visual question should not wait an extra second before Gemini sees the scene.
    void sendNextFrame();
    this.frameTimer = setInterval(() => void sendNextFrame(), FRAME_INTERVAL_MS);
  }
}
