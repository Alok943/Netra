// Flashlight (camera torch). Android Chrome exposes it as a track constraint; many phones and all desktops do not.

interface TorchCapabilities {
  torch?: boolean;
}

/** True when this camera stream can switch its light on. */
export function torchSupported(stream: MediaStream | null): boolean {
  const track = stream?.getVideoTracks()[0];
  const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & TorchCapabilities) | undefined;
  return caps?.torch === true;
}

/** Switches the light on or off. Returns false when the phone refused. */
export async function setTorch(stream: MediaStream | null, on: boolean): Promise<boolean> {
  const track = stream?.getVideoTracks()[0];
  if (!track) return false;
  try {
    await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
    return true;
  } catch (err) {
    console.warn("[torch] could not switch the light", err);
    return false;
  }
}

/** Average brightness of the current frame, 0 (black) to 255 (white), from a tiny downscaled copy. */
export function frameBrightness(video: HTMLVideoElement, canvas: HTMLCanvasElement): number {
  const w = 16;
  const h = 12;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 255; // can't measure: never claim it is dark
  ctx.drawImage(video, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  return sum / (w * h);
}
