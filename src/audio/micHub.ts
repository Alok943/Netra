// One microphone stream shared by everything that listens: the wake word (always, while enabled) and Gemini Live
// (only during a voice session). The mic opens on the first subscriber and closes when the last one leaves.
import { MicCapture } from "./micCapture";

type Listener = (pcm16k: Int16Array) => void;

class MicHub {
  private capture = new MicCapture();
  private listeners = new Set<Listener>();
  private opening: Promise<void> | null = null;
  private running = false;

  /** Starts delivering 16 kHz mono PCM chunks (100 ms each). Returns a function that stops this subscription. */
  async subscribe(listener: Listener): Promise<() => void> {
    this.listeners.add(listener);
    if (!this.running) {
      this.opening ??= this.capture
        .start((pcm) => this.listeners.forEach((l) => l(pcm)))
        .then(() => {
          this.running = true;
        })
        .catch((err) => {
          this.listeners.delete(listener);
          throw err;
        })
        .finally(() => {
          this.opening = null;
        });
      await this.opening;
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.running) {
        this.capture.stop();
        this.running = false;
      }
    };
  }
}

export const micHub = new MicHub();
