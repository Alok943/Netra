// Tunables in one place. Distances are rough; calibrate on a real phone by walking toward objects.
export const CONFIG = {
  /** Keep in step with package.json. Saved device decisions (such as the detector choice) are dropped when it changes. */
  appVersion: "0.1.0",
  /** Gemini Live API version. Ephemeral tokens only work on v1beta. Keep in step with LIVE_API_VERSION in server/handlers.ts. */
  liveApiVersion: "v1beta",
  camera: {
    idealWidth: 640,
    idealHeight: 480,
    /** Approximate field of view across the frame's LONG side for a phone main camera */
    fovLongSideDeg: 66,
    /** No new video frame for this long while running means the camera was stopped (screen lock, app switch) */
    stallMs: 2000,
  },
  /** Flashlight. OWNER DECIDES the brightness numbers (0 = black, 255 = white): confirm them in a dim room and outdoors. */
  torch: {
    sampleMs: 1000,
    /** Auto mode turns the light on after this many samples in a row darker than darkLuma */
    darkLuma: 35,
    darkSamples: 3,
    /**
     * Turning the light off again. The camera adjusts its exposure to the light, so the picture is rarely "bright" while the
     * light is on. Instead, every probeEveryMs (sooner if the picture suddenly gets brighter by jumpRatio) the light is
     * switched off for about a second: if the picture is still at least probeLuma it stays off, otherwise it comes back on.
     */
    probeLuma: 50,
    probeSettleMs: 800,
    probeEveryMs: 20_000,
    jumpRatio: 1.3,
  },
  voice: {
    /** How long a spoken question is waited for (Ask Netra and the local command button) */
    listenMs: 12_000,
    /** "Hey Netra" opens Gemini Live straight away. false = listen first and answer simple questions on the phone. */
    wakeOpensGemini: true,
    /** Gemini Live session: wait this long for the first question, and this long for a follow-up after an answer.
     *  Longer is easier to use; shorter costs less because the microphone and camera stream while it waits. */
    firstTurnMs: 15_000,
    followUpMs: 10_000,
  },
  detector: {
    /** GPU phones get the bigger, more accurate model; WASM-only phones get the nano one. */
    models: {
      webgpu: { url: "/models/yolo26s-416.onnx", inputSize: 416 },
      /** Middle option for phones whose GPU is too slow for the 's' model */
      webgpuSmall: { url: "/models/yolo26n-416.onnx", inputSize: 416 },
      wasm: { url: "/models/yolo26n-416.onnx", inputSize: 416 },
    },
    /** OWNER DECIDES: slowest acceptable median frame time. Above this, fall back to a smaller model (150 ms is about 6-7 fps). */
    maxFrameMs: 150,
    /** IoU threshold for NMS; used only when the model emits raw (non end-to-end) output */
    nmsIou: 0.45,
    /** At or above this the detection is trusted (drives haptics and plain announcements) */
    minScore: 0.5,
    /** Between this and minScore a detection is reported as "possibly a ..." with a size, never as a danger */
    maybeScore: 0.3,
    maxBoxes: 15,
  },
  distance: {
    /** Camera range is deliberately more conservative than a real depth sensor. */
    visualVeryNearM: 0.7,
    visualNearM: 1.5,
    veryNearM: 1.0,
    nearM: 2.0,
    /** Box covering this fraction of the frame is treated as very near regardless of class */
    veryNearAreaFrac: 0.45,
    nearAreaFrac: 0.2,
  },
  path: {
    /**
     * The track: a lane on the GROUND, shown on screen. horizonY is where the ground starts when the phone is held level
     * (about the middle of the frame); nothing above it can be standing on the ground, so it is never "in your path".
     * Tilt the phone up or down and the real horizon moves: adjust horizonY after a walking test.
     * Everything is a fraction of the frame. It starts at horizonY (from the top)
     * with the topLeft..topRight width, and widens to bottomLeft..bottomRight at the bottom edge.
     * An object whose base is inside it is "in your path": announced, and able to trigger vibration.
     */
    track: { horizonY: 0.5, topLeft: 0.43, topRight: 0.57, bottomLeft: 0.1, bottomRight: 0.9 },
  },
  reflex: {
    /** Consecutive frames required before escalating haptics (debounces flicker) */
    escalateFrames: 2,
    /** Time a level must be absent before haptics stand down */
    releaseMs: 700,
    repeatMs: { near: 1400, very_near: 600 },
  },
  hazards: {
    /** Conservatively alert only for elevated recognised objects at this range. */
    overheadRangeM: 2.5,
    confirmFrames: 2,
    repeatMs: { overhead: 1800, drop_off: 800 },
  },
  announce: {
    /** Frames an object must be seen in a row before it can be announced (filters flicker) */
    persistFrames: 3,
    gapMs: 4000,
    /** Crowd mode: this many confident people (or objects of any kind) at once */
    crowdPeople: 4,
    crowdObjects: 6,
    crowdCooldownMs: 25_000,
    crowdGapMs: 8000,
    crowdSummaryEveryMs: 15_000,
  },
  speech: {
    lang: "en-IN",
    /** Do not repeat a proactive announcement for the same label within this window */
    proactiveCooldownMs: 10_000,
  },
  router: {
    jevTimeoutMs: 1500,
    confidenceThreshold: 0.8,
    /** Minimum gap between router calls for proactive triggers (limits Jev cost and chatter) */
    minGapMs: 4000,
  },
} as const;
