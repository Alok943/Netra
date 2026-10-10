import { CONFIG } from "../config";

/**
 * Opens the camera. `onLost` is called (with the stream) if the video track ends or mutes later on, which is what
 * Android does when the screen locks or the user switches apps. Stopping the stream with stopCamera does not call it.
 */
export async function startCamera(video: HTMLVideoElement, onLost?: (stream: MediaStream) => void): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false, // mic is requested separately, only when voice is needed
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: CONFIG.camera.idealWidth },
      height: { ideal: CONFIG.camera.idealHeight },
    },
  });
  const track = stream.getVideoTracks()[0];
  if (onLost && track) {
    track.addEventListener("ended", () => onLost(stream));
    track.addEventListener("mute", () => onLost(stream));
  }
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (!video.videoWidth) {
    await new Promise<void>((res) => video.addEventListener("loadedmetadata", () => res(), { once: true }));
  }
  return stream;
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/**
 * Grabs the current frame as a downscaled JPEG. For the Gemini Live handler (~1 fps, only
 * while a routed query is active). Frames are never sent to Jev.
 */
export async function captureJpeg(video: HTMLVideoElement, maxW = 640, quality = 0.6): Promise<Blob | null> {
  const scale = Math.min(1, maxW / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
}
