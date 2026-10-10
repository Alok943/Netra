import { useCallback, useEffect, useRef, useState } from "react";
import { listeningChime } from "./audio/earcon";
import { TutorialPlayer } from "./audio/tutorial";
import { actionNeedsText, localVisionReply, parseLocalVisionAction, readTextOnDevice } from "./actions/localVision";
import { primeMicPermission } from "./audio/micCapture";
import { queryState, untilGranted } from "./device/permissions";
import { captureJpeg, startCamera, stopCamera } from "./camera/camera";
import { frameBrightness, setTorch, torchSupported } from "./camera/torch";
import { CaneBluetoothStub } from "./cane/caneBluetooth";
import { CONFIG } from "./config";
import { DebugOverlay } from "./components/DebugOverlay";
import { lastLoadSeconds, recordLoadTime } from "./device/loadTime";
import { disableWakeLock, enableWakeLock } from "./device/wakeLock";
import { GeminiLive, type LiveState } from "./handlers/geminiLive";
import { ASK_LANGUAGE, justNow, SPEECH_LANG, SYS } from "./i18n/strings";
import { PhoneVibration } from "./reflex/haptics";
import { HazardEngine } from "./reflex/hazardEngine";
import { ReflexEngine } from "./reflex/reflexEngine";
import { Announcer } from "./router/announcer";
import { route } from "./router/router";
import { describeObject, describeScene, isConfident } from "./router/ruleReply";
import { toRouterState, type Handler } from "./router/types";
import { listenOnce, parseLanguage, parseYesNo, YES_NO } from "./speech/listen";
import { enqueueAfter, loadPrompts, playPrompt, promptFor } from "./speech/prompts";
import { setSpeechLang, speak, speakAsync, stopSpeaking, warmUpSpeech } from "./speech/speak";
import type { DangerLevel, Detection, Lang } from "./types";
import { detect, detectorBackend, detectorMedianMs, loadDetector } from "./vision/detector";
import { enrich } from "./vision/distance";
import { localHazards } from "./vision/hazards";
import { startOwwWake, type OwwHandle } from "./wake/owwWake";
import { speechWakeSupported, startSpeechWake } from "./wake/speechWake";

type Phase = "idle" | "starting" | "running" | "error";

const phoneHaptics = new PhoneVibration();
const cane = new CaneBluetoothStub(); // future: connect and add as a second haptic output
const live = new GeminiLive();
const tutorial = new TutorialPlayer();
const TUTORIAL_HINT_KEY = "netra.tutorialHint";

const LANG_KEY = "netra.lang";
const TORCH_KEY = "netra.torch";
const WALK_MODE_KEY = "netra.walkMode";

function storedWalkMode(): boolean {
  try {
    return localStorage.getItem(WALK_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

type TorchMode = "auto" | "on" | "off";
const NEXT_TORCH_MODE: Record<TorchMode, TorchMode> = { auto: "on", on: "off", off: "auto" };

/** null = never asked: the user is asked once, the first time a phone with a flashlight starts Netra. */
function storedTorchMode(): TorchMode | null {
  try {
    const v = localStorage.getItem(TORCH_KEY);
    return v === "on" || v === "off" || v === "auto" ? v : null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Resolves at once if the page is visible, otherwise when it next becomes visible (camera requests fail while hidden). */
function untilVisible(): Promise<void> {
  if (document.visibilityState === "visible") return Promise.resolve();
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onChange);
      resolve();
    };
    document.addEventListener("visibilitychange", onChange);
  });
}

function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === "en" || v === "hi" ? v : null;
  } catch {
    return null;
  }
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);
  const quietRef = useRef(false);
  const walkModeRef = useRef(storedWalkMode());
  const detectionsRef = useRef<Detection[]>([]);
  const frameRef = useRef({ w: 640, h: 480 });
  const dangerRef = useRef<DangerLevel>("none");
  const dangerDetRef = useRef<Detection | null>(null);
  const lastRouteRef = useRef<Handler | null>(null);
  const loopIdRef = useRef(0);
  /** Camera watchdog: the video time last seen to advance, and when. */
  const lastFrameRef = useRef({ at: 0, time: -1 });
  /** True from camera loss until the camera is back; the loop skips detection meanwhile so stale frames can't buzz. */
  const cameraLostRef = useRef(false);
  const recoverCameraRef = useRef<() => Promise<void>>(async () => {});
  const checkCameraRef = useRef<() => Promise<void>>(async () => {});
  const checkingCameraRef = useRef(false);
  /** What the flashlight is actually doing. Kept in a ref so camera recovery can switch it back on. */
  const torchOnRef = useRef(false);
  const announcerRef = useRef(new Announcer());
  const langRef = useRef<Lang>(storedLang() ?? "en");
  const langChoiceRef = useRef<((l: Lang) => void) | null>(null);
  const startLiveRef = useRef<(initialText?: string) => Promise<void>>(async () => {});

  const [lang, setLangState] = useState<Lang>(langRef.current);
  const [askingLang, setAskingLang] = useState(false);
  const [askingTorch, setAskingTorch] = useState(false);
  const [tutorialOn, setTutorialOn] = useState(false);
  const prevLiveRef = useRef<LiveState>("off");
  const welcomedRef = useRef(false);
  const connectStartRef = useRef(0);
  const [connectMs, setConnectMs] = useState<number | null>(null);
  const torchChoiceRef = useRef<((yes: boolean | null) => void) | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;
  const [status, setStatus] = useState<string>(SYS[langRef.current].tapToStart);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [danger, setDanger] = useState<DangerLevel>("none");
  const [frame, setFrame] = useState(frameRef.current);
  const [fps, setFps] = useState(0);
  const [quiet, setQuiet] = useState(false);
  const [walkMode, setWalkMode] = useState(storedWalkMode);
  const [debug, setDebug] = useState(true);
  const [liveState, setLiveState] = useState<LiveState>("off");
  const [routeInfo, setRouteInfo] = useState("");
  const [wakeOn, setWakeOn] = useState(() => {
    try {
      return localStorage.getItem("netra.heyNetra") === "1";
    } catch {
      return false;
    }
  });
  const [camInfo, setCamInfo] = useState("off");
  const [torchMode, setTorchMode] = useState<TorchMode>(() => storedTorchMode() ?? "off");
  const [torchOk, setTorchOk] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [wakeInfo, setWakeInfo] = useState("off");
  const [wakeScore, setWakeScore] = useState(0);
  const [trainedWake, setTrainedWake] = useState<boolean | null>(null);
  const owwRef = useRef<OwwHandle | null>(null);

  const T = () => SYS[langRef.current];

  const applyLang = useCallback((l: Lang, persist = true) => {
    langRef.current = l;
    setLangState(l);
    setSpeechLang(l);
    void loadPrompts(l); // pre-load this language's recorded messages
    if (persist) {
      try {
        localStorage.setItem(LANG_KEY, l);
      } catch {
        /* preference is optional */
      }
    }
  }, []);
  setSpeechLang(langRef.current);

  const reflexRef = useRef<ReflexEngine | null>(null);
  const hazardRef = useRef<HazardEngine | null>(null);
  if (!hazardRef.current) hazardRef.current = new HazardEngine([phoneHaptics]);
  if (!reflexRef.current) {
    reflexRef.current = new ReflexEngine([phoneHaptics], (level) => {
      const prev = dangerRef.current;
      setDanger(level);
      dangerRef.current = level;
      if (level === "very_near") {
        // Visual distance is a fallible monocular estimate. It may vibrate, but
        // it must never discard a user's Gemini answer. A future calibrated
        // depth/ultrasonic input can be given explicit interruption authority.
        const nearest = detectionsRef.current
          .filter((d) => d.inPath && d.proximity === "very_near" && isConfident(d))
          .sort((a, b) => (a.distanceM ?? 99) - (b.distanceM ?? 99))[0];
        dangerDetRef.current = nearest ?? null;
      } else if (prev === "very_near" && dangerDetRef.current) {
        // The alert has eased: say what it was only when Gemini is not talking.
        // During Live, safety feedback remains haptic-only.
        const d = dangerDetRef.current;
        dangerDetRef.current = null;
        if (live.active) return;
        const { w, h } = frameRef.current;
        setTimeout(() => {
          if (!runningRef.current || dangerRef.current === "very_near") return;
          const text = justNow(describeObject(d, w, h, langRef.current), langRef.current);
          setStatus(text);
          speak(text, "system");
        }, 600);
      }
    });
  }

  /** Shows and says a system message: with its pre-recorded voice if there is one, else with the phone's voice. */
  const announce = useCallback((text: string): Promise<void> => {
    setStatus(text);
    const url = promptFor(text, langRef.current);
    if (!url) {
      // Phone-voice message (for example the loading time): joins the same queue, so recordings are never cut off.
      enqueueAfter(() => speakAsync(text, "system", undefined, { queue: true }));
      return Promise.resolve();
    }
    window.speechSynthesis?.cancel(); // phone voice off; a recording that is still playing finishes first
    return playPrompt(url, { queue: true }).then((ok) => {
      // Not played (blocked before the first touch, or the file is missing): the phone speaks it instead.
      // A false that came from being cut off by newer speech must not repeat the old message.
      if (!ok && !window.speechSynthesis?.speaking) speak(text, "system");
    });
  }, []);

  /** Switches the flashlight. `auto` switches are spoken, because the user cannot see the light change. */
  const setLight = useCallback(
    async (on: boolean, byAuto = false) => {
      if (torchOnRef.current === on) return;
      const ok = await setTorch(streamRef.current, on);
      if (!ok) {
        if (!byAuto) announce(T().lightFailed);
        return;
      }
      torchOnRef.current = on;
      setTorchOn(on);
      if (byAuto) announce(on ? T().lightAutoOn : T().lightAutoOff);
    },
    [announce],
  );

  /** Unsure detection: ask the router who should describe it. A confident "gemini_live" opens a voice session that looks at the camera. */
  const describeUnsure = useCallback(
    async (text: string, d: Detection, dets: Detection[]) => {
      const decision = await route(toRouterState({ kind: "new_object", label: d.label }, dets, langRef.current, lastRouteRef.current));
      lastRouteRef.current = decision.handler;
      setRouteInfo(`${decision.handler} via ${decision.source}`);
      if (quietRef.current || dangerRef.current === "very_near" || live.active || !decision.speakNow) return;
      if (decision.handler === "gemini_live" && decision.source === "jev" && navigator.onLine) {
        void startLiveRef.current(T().liveProactive(d.label));
      } else {
        setStatus(text);
        speak(text, "proactive");
      }
    },
    [],
  );

  const proactive = useCallback(
    (dets: Detection[], w: number, h: number) => {
      if (quietRef.current || live.active || tutorial.playing) return;
      const spoken = announcerRef.current.update(dets, w, h, langRef.current, performance.now());
      if (!spoken) return;
      // Help-me-walk is deliberately local-only: it gives short detector-based
      // cues and haptics, but never starts a cloud voice session while moving.
      if (!walkModeRef.current && !spoken.crowd && !isConfident(spoken.det) && navigator.onLine) {
        void describeUnsure(spoken.text, spoken.det, dets);
      } else {
        setStatus(spoken.text);
        speak(spoken.text, "proactive");
      }
    },
    [describeUnsure],
  );

  const loop = useCallback(async () => {
    const video = videoRef.current!;
    // A new loop id retires any older loop still awaiting a frame (Stop then Start), so only one runs inference.
    const loopId = ++loopIdRef.current;
    let frames = 0;
    let fpsT0 = performance.now();
    lastFrameRef.current = { at: fpsT0, time: video.currentTime };
    while (runningRef.current && loopId === loopIdRef.current) {
      if (!cameraLostRef.current) {
        // Watchdog: a live camera keeps delivering new frames (even dark ones). No new frame for stallMs means it stopped.
        const wd = lastFrameRef.current;
        const t = performance.now();
        if (video.currentTime !== wd.time) {
          wd.time = video.currentTime;
          wd.at = t;
        } else if (t - wd.at > CONFIG.camera.stallMs) {
          void recoverCameraRef.current();
        }
      }
      if (!cameraLostRef.current && video.readyState >= 2) {
        try {
          const raw = await detect(video);
          const dets = enrich(raw, video.videoWidth, video.videoHeight);
          detectionsRef.current = dets;
          // Only trusted detections can trigger vibration; "maybe" ones are spoken about, never buzzed.
          reflexRef.current!.update(dets.filter(isConfident), performance.now(), video.videoWidth);
          // Upper-scene and future road-hazard labels have their own haptic vocabulary.
          // These local rules never start a voice or network session.
          hazardRef.current!.update(localHazards(dets, video.videoWidth, video.videoHeight));
          setDetections(dets);
          proactive(dets, video.videoWidth, video.videoHeight);
          frames++;
        } catch (err) {
          console.error(err);
        }
      }
      const now = performance.now();
      if (now - fpsT0 >= 1000) {
        setFps(Math.round((frames * 1000) / (now - fpsT0)));
        frames = 0;
        fpsT0 = now;
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
  }, [proactive]);

  /** First run: ask which language, by voice or by tapping the top (English) or bottom (Hindi) half of the screen. */
  const chooseLanguage = useCallback(async (): Promise<Lang> => {
    setAskingLang(true);
    setStatus(`${ASK_LANGUAGE.en} / ${ASK_LANGUAGE.hi}`);
    const tapped = new Promise<Lang>((res) => (langChoiceRef.current = res));
    const voice = (async (): Promise<Lang> => {
      speak(ASK_LANGUAGE.en, "system", SPEECH_LANG.en);
      speak(ASK_LANGUAGE.hi, "system", SPEECH_LANG.hi, { queue: true });
      // Wait for the question to finish before listening, so the mic doesn't hear it.
      const t0 = Date.now();
      while (window.speechSynthesis?.speaking && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 200));
      return parseLanguage(await listenOnce("en-IN", 8000)) ?? "en";
    })();
    const chosen = await Promise.race([tapped, voice]);
    langChoiceRef.current = null;
    stopSpeaking();
    setAskingLang(false);
    applyLang(chosen);
    return chosen;
  }, [applyLang]);

  /** First run on a phone with a flashlight: ask whether Netra may switch it on by itself. Voice, or tap top (yes) / bottom (no). */
  const chooseTorch = useCallback(async (): Promise<void> => {
    const question = SYS[langRef.current].askLight;
    setAskingTorch(true);
    setStatus(question);
    const tapped = new Promise<boolean | null>((res) => (torchChoiceRef.current = res));
    const voice = (async (): Promise<boolean | null> => {
      speak(question, "system");
      const t0 = Date.now();
      while (window.speechSynthesis?.speaking && Date.now() - t0 < 25000) await sleep(200);
      return parseYesNo(await listenOnce(SPEECH_LANG[langRef.current], 8000, YES_NO));
    })();
    const answer = await Promise.race([tapped, voice]);
    torchChoiceRef.current = null;
    stopSpeaking();
    setAskingTorch(false);
    if (answer === null) return; // no answer heard: stay off for now and ask again next time
    const mode: TorchMode = answer ? "auto" : "off";
    setTorchMode(mode);
    try {
      localStorage.setItem(TORCH_KEY, mode);
    } catch {
      /* preference is optional */
    }
    announce(answer ? SYS[langRef.current].lightAllowed : SYS[langRef.current].lightDenied);
  }, [announce]);

  /** The track ended or muted: ignore it if it belongs to a stream we already replaced, else check whether it comes back. */
  const onCameraLost = useCallback((s: MediaStream) => {
    if (s === streamRef.current) void checkCameraRef.current();
  }, []);

  /** Opens the camera, asking until the user allows it. Used by start() and by camera recovery. */
  const openCamera = useCallback(
    (video: HTMLVideoElement) =>
      untilGranted("camera", () => startCamera(video, onCameraLost), {
        onPrompt: () => announce(T().permCamera),
        onBlocked: () => announce(T().permCameraBlocked),
      }),
    [announce, onCameraLost],
  );

  /**
   * Android stops the camera on screen lock or app switch. Warn by vibration (detection is off, so no danger buzz is
   * possible), stop any stale danger alert, reopen the camera and carry on in the existing loop.
   */
  const recoverCamera = useCallback(async () => {
    if (cameraLostRef.current || !runningRef.current) return;
    cameraLostRef.current = true;
    setCamInfo("lost");
    reflexRef.current!.stop(); // an old danger buzz must not keep repeating from stale detections
    dangerRef.current = "none";
    dangerDetRef.current = null;
    detectionsRef.current = [];
    setDanger("none");
    setDetections([]);
    phoneHaptics.pulse("camera_lost");
    announce(T().cameraLost);
    const video = videoRef.current!;
    stopCamera(streamRef.current);
    streamRef.current = null;
    while (runningRef.current) {
      try {
        await untilVisible(); // the browser refuses camera requests from a hidden page (locked screen)
        setCamInfo("restarting");
        const stream = await openCamera(video);
        if (!runningRef.current) {
          stopCamera(stream); // Stop was pressed while the camera was reopening
          break;
        }
        streamRef.current = stream;
        frameRef.current = { w: video.videoWidth, h: video.videoHeight };
        setFrame(frameRef.current);
        lastFrameRef.current = { at: performance.now(), time: video.currentTime };
        setTorchOk(torchSupported(stream));
        if (torchOnRef.current && !(await setTorch(stream, true))) {
          torchOnRef.current = false; // the phone would not switch it back on
          setTorchOn(false);
        }
        cameraLostRef.current = false;
        setCamInfo("restarted");
        announce(T().cameraBack);
        return;
      } catch (err) {
        console.error("[camera] restart failed, retrying", err);
        setCamInfo(`retry (${err instanceof Error ? err.name : "error"})`);
        phoneHaptics.pulse("camera_lost");
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    cameraLostRef.current = false;
  }, [announce, openCamera]);
  recoverCameraRef.current = recoverCamera;

  /**
   * Called when the track mutes or ends, and when the app becomes visible again. Chrome on Android normally pauses the
   * camera when the screen locks and resumes it by itself on return, so give it a moment before tearing it down.
   * Only acts while visible: nothing can be done (or felt) while the screen is off.
   */
  const checkCamera = useCallback(async () => {
    if (checkingCameraRef.current || cameraLostRef.current || !runningRef.current) return;
    if (document.visibilityState !== "visible") return;
    checkingCameraRef.current = true;
    try {
      const video = videoRef.current!;
      if (video.paused) void video.play().catch(() => {});
      const track = () => streamRef.current?.getVideoTracks()[0];
      const alive = () => track()?.readyState === "live" && !track()?.muted;
      const t0 = performance.now();
      while (
        runningRef.current &&
        document.visibilityState === "visible" &&
        !alive() &&
        track()?.readyState !== "ended" &&
        performance.now() - t0 < 1500
      ) {
        await sleep(100);
      }
      if (!runningRef.current || document.visibilityState !== "visible") return;
      if (alive()) {
        lastFrameRef.current = { at: performance.now(), time: video.currentTime };
        setCamInfo("live");
      } else {
        await recoverCameraRef.current();
      }
    } finally {
      checkingCameraRef.current = false;
    }
  }, []);
  checkCameraRef.current = checkCamera;

  const start = useCallback(async () => {
    if (phase === "starting" || phase === "running") return;
    setPhase("starting");
    // Haptic confirmation also "unlocks" vibration with this user gesture.
    phoneHaptics.pulse("near");
    try {
      // Only ask the user to tap Allow when Chrome is really going to show a prompt.
      announce((await queryState("camera")) === "granted" ? T().startingShort : T().starting);
      const video = videoRef.current!;
      // Ask for the camera until it is allowed: a dismissed prompt is shown again, a blocked one is explained.
      streamRef.current = await openCamera(video);
      setTorchOk(torchSupported(streamRef.current));
      frameRef.current = { w: video.videoWidth, h: video.videoHeight };
      setFrame(frameRef.current);
      void live.unlockAudio(); // allowed here because Start is a user gesture
      const wake = await enableWakeLock();
      if ((await queryState("microphone")) !== "granted") announce(T().allowMic);
      let micOk = true;
      try {
        await untilGranted("microphone", () => primeMicPermission(), {
          onPrompt: () => announce(T().permMic),
          onBlocked: () => announce(T().permMicBlocked),
        });
      } catch {
        micOk = false; // no microphone at all: carry on without voice
      }
      if (storedLang() === null) await chooseLanguage();
      if (torchSupported(streamRef.current) && storedTorchMode() === null) await chooseTorch();
      const secs = lastLoadSeconds();
      if (secs === null || secs > 3) announce(secs ? T().loadKnown(secs) : T().loadFirst); // a quick load needs no announcement
      const loadStart = performance.now();
      await loadDetector();
      recordLoadTime(performance.now() - loadStart);
      announcerRef.current.reset();
      runningRef.current = true;
      setCamInfo("live");
      setPhase("running");
      const t = T();
      // "Netra is ready" in the recorded voice; any problems are added after it in the phone's voice.
      const problems = [phoneHaptics.supported ? "" : t.noVibration, wake ? "" : t.noWakeLock, micOk ? "" : t.micOff]
        .filter(Boolean)
        .join(" ");
      void announce(t.ready).then(() => {
        let extra = problems;
        try {
          if (!localStorage.getItem(TUTORIAL_HINT_KEY)) {
            localStorage.setItem(TUTORIAL_HINT_KEY, "1");
            extra = [extra, t.tutorialHint].filter(Boolean).join(" "); // said once, the first time only
          }
        } catch {
          /* hint is optional */
        }
        if (!extra) return;
        setStatus(`${t.ready} ${extra}`);
        speak(extra, "system", undefined, { queue: true });
      });
      void loop();
    } catch (err) {
      console.error(err);
      setPhase("error");
      setAskingLang(false);
      setAskingTorch(false);
      const name = err instanceof Error ? err.name : "";
      announce(name === "NotAllowedError" ? T().cameraDenied : T().startFailed);
    }
  }, [phase, announce, loop, chooseLanguage, chooseTorch, openCamera]);

  const stop = useCallback(async () => {
    tutorial.stop();
    setTutorialOn(false);
    runningRef.current = false;
    reflexRef.current!.stop();
    stopCamera(streamRef.current); // also switches the light off
    streamRef.current = null;
    torchOnRef.current = false;
    setTorchOn(false);
    setTorchOk(false);
    await disableWakeLock();
    await live.stop();
    setDetections([]);
    setDanger("none");
    setPhase("idle");
    announce(T().stopped);
  }, [announce]);

  const startLive = useCallback(async (initialText?: string) => {
    if (live.active || !runningRef.current) return;
    const { w, h } = frameRef.current;
    if (!navigator.onLine) {
      // Offline: the on-device rule reply still answers.
      const text = describeScene(detectionsRef.current, w, h, langRef.current);
      setStatus(text);
      speak(text, "query");
      return;
    }
    tutorial.stop();
    setTutorialOn(false);
    stopSpeaking();
    await live.start({
      language: langRef.current,
      initialText,
      getFrame: () => captureJpeg(videoRef.current!),
      onState: (st) => {
        setLiveState(st);
        if (st === "connecting") {
          setStatus("Connecting to Netra…");
          connectStartRef.current = performance.now();
        }
        if (st === "listening") {
          setStatus("Listening — ask your question now.");
          listeningChime();
          // One short buzz when the session first opens, for users who cannot hear the chime over traffic.
          if (prevLiveRef.current === "connecting") {
            phoneHaptics.pulse("listening");
            setConnectMs(Math.round(performance.now() - connectStartRef.current)); // tap to ready, shown in the debug bar
          }
        }
        prevLiveRef.current = st;
        if (st === "processing") setStatus("I heard you. Thinking…");
        if (st === "speaking") setStatus("Netra is answering.");
      },
      onTranscript: (who, text) => setStatus(who === "user" ? `You: ${text}` : text),
      onError: (err) => {
        console.error("[live]", err);
        const text = describeScene(detectionsRef.current, w, h, langRef.current);
        setStatus(text);
        speak(`${T().liveDown} ${text}`, "query");
      },
      onClosed: () => setLiveState("off"),
    });
  }, []);
  startLiveRef.current = startLive;

  const talk = useCallback(() => {
    // Tap to talk: opens (or closes) a Gemini Live voice session. Offline it falls back to the rule reply.
    if (live.active) void live.stop();
    else void startLive();
  }, [startLive]);

  /** Local command path for predictable vision actions. It never opens Gemini Live. */
  const askLocal = useCallback(async () => {
    if (!runningRef.current) return;
    const langNow = langRef.current;
    setStatus(langNow === "hi" ? "स्थानीय कमांड सुन रहा है।" : "Listening for a local command.");
    phoneHaptics.pulse("listening");
    const heard = await listenOnce(SPEECH_LANG[langNow], 6000);
    if (!heard) {
      const text = langNow === "hi" ? "मुझे कमांड सुनाई नहीं दी।" : "I did not hear a command.";
      setStatus(text);
      speak(text, "query");
      return;
    }
    const action = parseLocalVisionAction(heard);
    const { w, h } = frameRef.current;
    setStatus(langNow === "hi" ? "फोन पर पढ़ रहा है।" : "Reading on this phone.");
    const text = actionNeedsText(action) ? await readTextOnDevice(videoRef.current!) : null;
    const reply = localVisionReply(action, detectionsRef.current, w, h, langNow, text);
    setStatus(reply);
    speak(reply, "query");
  }, []);

  const talkRef = useRef(talk);
  talkRef.current = talk;

  const toggleQuiet = useCallback(() => {
    const next = !quietRef.current;
    quietRef.current = next;
    setQuiet(next);
    if (next) stopSpeaking();
    announce(next ? T().quietOn : T().quietOff);
  }, [announce]);

  const toggleWalkMode = useCallback(() => {
    const next = !walkModeRef.current;
    walkModeRef.current = next;
    setWalkMode(next);
    try {
      localStorage.setItem(WALK_MODE_KEY, next ? "1" : "0");
    } catch {
      /* preference is optional */
    }
    const text = langRef.current === "hi"
      ? next ? "चलने में मदद मोड चालू। सिर्फ़ स्थानीय चेतावनियाँ।" : "चलने में मदद मोड बंद।"
      : next ? "Help me walk mode on. Local alerts only." : "Help me walk mode off.";
    setStatus(text);
    speak(text, "system");
  }, []);

  /** Plays the recorded tutorial, or stops it. Needs a button press, which also lets the browser play sound. */
  const toggleTutorial = useCallback(async () => {
    if (tutorial.playing) {
      tutorial.stop();
      setTutorialOn(false);
      setStatus(SYS[langRef.current].tutorial);
      return;
    }
    if (live.active) await live.stop();
    stopSpeaking();
    setTutorialOn(true);
    try {
      await tutorial.play(langRef.current, (step) => setStatus(step.text));
    } catch (err) {
      console.error("[tutorial]", err);
      announce(SYS[langRef.current].tutorialFailed);
    } finally {
      setTutorialOn(false);
    }
  }, [announce]);

  const switchLanguage = useCallback(() => {
    const next: Lang = langRef.current === "en" ? "hi" : "en";
    applyLang(next);
    announce(SYS[next].langSet);
  }, [applyLang, announce]);

  // On open: start the speech engine warming up, and try to say the welcome line. Chrome only allows speech before
  // the first touch in some cases (such as an installed app); if it is blocked, the first tap starts Netra anyway.
  useEffect(() => {
    warmUpSpeech();
    if (storedLang() === null) {
      // Very first open: "Welcome to Netra", then straight to the language question, before anything else is asked
      // (permissions come after, in start()). StrictMode runs effects twice in development, hence the flag.
      if (!welcomedRef.current) {
        welcomedRef.current = true;
        void chooseLanguage().then((l) => {
          void loadPrompts(l).then(() => {
            if (phaseRef.current === "idle") announce(SYS[l].tapToStart);
          });
        });
      }
      return;
    }
    void loadPrompts(langRef.current).then(() => {
      if (phaseRef.current !== "idle") return;
      announce(SYS[langRef.current].tapToStart);
    });
  }, []);

  // Light button: Auto -> On -> Off. Manual choices apply at once; Auto leaves the light as it is and watches the picture.
  const cycleTorch = useCallback(() => {
    const next = NEXT_TORCH_MODE[torchMode];
    setTorchMode(next);
    try {
      localStorage.setItem(TORCH_KEY, next);
    } catch {
      /* preference is optional */
    }
    announce(T().lightMode[next]);
    if (next === "on") void setLight(true);
    if (next === "off") void setLight(false);
  }, [torchMode, announce, setLight]);

  // Auto light: on when the picture stays dark. To know when to switch off again, it briefly turns the light off and looks
  // (see CONFIG.torch): with the light on, the camera's own exposure hides how bright the surroundings really are.
  useEffect(() => {
    if (phase !== "running" || !torchOk || torchMode !== "auto") return;
    const c = CONFIG.torch;
    const canvas = document.createElement("canvas");
    let cancelled = false;
    let probing = false;
    let dark = 0;
    let jump = 0;
    let baseline: number | null = null; // typical brightness with the light on
    let onSamples = 0;
    let lastProbe = performance.now();

    const measure = () => frameBrightness(videoRef.current!, canvas);

    const probe = async () => {
      probing = true;
      try {
        if (!(await setTorch(streamRef.current, false))) return;
        await sleep(c.probeSettleMs); // let the camera's exposure adjust to the real light
        const samples: number[] = [];
        for (let i = 0; i < 3; i++) {
          samples.push(measure());
          await sleep(150);
        }
        samples.sort((x, y) => x - y);
        if (!cancelled && samples[1] >= c.probeLuma) {
          torchOnRef.current = false;
          setTorchOn(false);
          baseline = null;
          onSamples = 0;
          announce(T().lightAutoOff);
        } else {
          await setTorch(streamRef.current, true); // still dark (or the mode changed): put the light back
        }
      } finally {
        probing = false;
        lastProbe = performance.now();
        jump = 0;
      }
    };

    const id = setInterval(() => {
      const video = videoRef.current;
      if (!video || probing || video.readyState < 2 || cameraLostRef.current || document.visibilityState !== "visible") return;
      const luma = measure();
      if (!torchOnRef.current) {
        dark = luma < c.darkLuma ? dark + 1 : 0;
        if (dark >= c.darkSamples) {
          dark = 0;
          baseline = null;
          onSamples = 0;
          lastProbe = performance.now();
          void setLight(true, true);
        }
        return;
      }
      // Light is on. Never test while an alert, a conversation or the tutorial is going on.
      const busy = dangerRef.current !== "none" || live.active || tutorial.playing;
      const now = performance.now();
      const suddenlyBrighter = baseline !== null && onSamples >= 3 && luma > baseline * c.jumpRatio + 10;
      jump = suddenlyBrighter ? jump + 1 : 0;
      if (!suddenlyBrighter) {
        baseline = baseline === null ? luma : baseline * 0.8 + luma * 0.2;
        onSamples++;
      }
      if (!busy && (jump >= 2 || now - lastProbe > c.probeEveryMs)) void probe();
    }, c.sampleMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase, torchOk, torchMode, setLight, announce]);

  // Coming back to the app (screen unlock, app switch): check the camera now instead of waiting for the watchdog.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !runningRef.current || cameraLostRef.current) return;
      // Time spent hidden must not count as a stall; the check below decides whether the camera really stopped.
      lastFrameRef.current.at = performance.now();
      void checkCameraRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => () => {
    runningRef.current = false;
    stopCamera(streamRef.current);
  }, []);

  const running = phase === "running";

  const onWake = useCallback(() => {
    // Ignored while a danger alert is active: the reflex path owns the user's attention.
    if (!live.active && dangerRef.current !== "very_near") void startLiveRef.current();
  }, []);

  // "Hey Netra" (toggle in the debug bar). First choice: the trained on-device model. If its files are not
  // installed, fall back to the simple speech-recognition version below.
  useEffect(() => {
    if (!running || !wakeOn) {
      setTrainedWake(null);
      return;
    }
    let cancelled = false;
    void startOwwWake(onWake, (s) => setWakeScore(Math.round(s * 100) / 100)).then((handle) => {
      if (cancelled) return handle?.stop();
      owwRef.current = handle;
      setTrainedWake(handle !== null);
      if (handle) setWakeInfo("listening (on-device model)");
    });
    return () => {
      cancelled = true;
      owwRef.current?.stop();
      owwRef.current = null;
    };
  }, [running, wakeOn, onWake]);

  // The trained model stops listening while a voice session is open (the session uses the same microphone stream).
  useEffect(() => {
    owwRef.current?.setPaused(liveState !== "off");
  }, [liveState]);

  // Fallback: Chrome's speech recognition looks for the phrase. Paused while a voice session is open.
  useEffect(() => {
    if (trainedWake !== false) return;
    if (!running || !wakeOn || liveState !== "off") {
      setWakeInfo(!wakeOn ? "off" : running ? "paused" : "off");
      return;
    }
    const handle = startSpeechWake(onWake, (reason) => {
      setWakeOn(false);
      setWakeInfo(`off (${reason})`);
      announce(T().wakeDown);
    });
    setWakeInfo(handle ? "listening (speech recognition)" : "off (not supported)");
    return () => handle?.stop();
  }, [trainedWake, running, wakeOn, liveState, announce, onWake]);

  const toggleWake = useCallback((on: boolean) => {
    setWakeOn(on);
    try {
      localStorage.setItem("netra.heyNetra", on ? "1" : "0");
    } catch {
      /* preference is optional */
    }
  }, []);

  // Touch anywhere on the screen. Idle: a tap starts Netra. Running: a double-tap talks. Buttons and inputs don't count.
  useEffect(() => {
    let last = { t: 0, x: 0, y: 0 };
    const onUp = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest("button, input, label, a, .lang-choice")) return;
      if (phase === "idle" || phase === "error") {
        void start();
        return;
      }
      if (!running) return;
      const now = performance.now();
      const near = Math.hypot(e.clientX - last.x, e.clientY - last.y) < 60;
      if (now - last.t < 400 && near) {
        last = { t: 0, x: 0, y: 0 };
        talkRef.current();
      } else {
        last = { t: now, x: e.clientX, y: e.clientY };
      }
    };
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [phase, running, start]);

  const t = SYS[lang];

  return (
    <main className={`app danger-${danger}`}>
      <div className="viewport">
        <div className="video-wrap" aria-hidden="true" style={{ aspectRatio: `${frame.w} / ${frame.h}`, ["--ar" as string]: frame.w / frame.h }}>
          <video ref={videoRef} className={debug ? "" : "hidden"} muted playsInline />
          {debug && running && <DebugOverlay detections={detections} width={frame.w} height={frame.h} />}
        </div>
        {!running && !askingLang && !askingTorch && (
          <button className="start" onClick={start} disabled={phase === "starting"}>
            {phase === "starting" ? "…" : lang === "hi" ? "नेत्र शुरू करें" : "Start Netra"}
          </button>
        )}
        {askingTorch && (
          <div className="lang-choice">
            <button onClick={() => torchChoiceRef.current?.(true)}>{SYS[lang].yes}</button>
            <button onClick={() => torchChoiceRef.current?.(false)}>{SYS[lang].no}</button>
          </div>
        )}
        {askingLang && (
          <div className="lang-choice">
            <button onClick={() => langChoiceRef.current?.("en")}>English</button>
            <button onClick={() => langChoiceRef.current?.("hi")}>हिन्दी</button>
          </div>
        )}
      </div>

      {/* aria-live is off on purpose: Netra speaks every message itself, and a screen reader would read it a second time on top. */}
      <p className="status" role="status" aria-live="off">
        {status}
      </p>

      {!running && !askingLang && !askingTorch && (
        <button className="toggle tutorial" onClick={() => void toggleTutorial()} aria-pressed={tutorialOn}>
          {tutorialOn ? t.tutorialStop : t.tutorial}
        </button>
      )}

      {running && (
        <section className="controls">
          <button className="talk" onClick={talk} aria-label="Tap to talk. Starts a voice conversation with Netra.">
            {lang === "hi" ? "बोलिए" : "Tap to talk"}
          </button>
          <button className="toggle" onClick={() => void askLocal()} aria-label="Ask Netra with local, no-Gemini vision rules.">
            {lang === "hi" ? "स्थानीय सवाल" : "Ask Netra offline"}
          </button>
          <div className="row">
            <button className={`toggle ${quiet ? "on" : ""}`} onClick={toggleQuiet} aria-pressed={quiet}>
              {lang === "hi" ? `शांत ${quiet ? "चालू" : "बंद"}` : `Quiet ${quiet ? "ON" : "OFF"}`}
            </button>
            <button className={`toggle ${walkMode ? "on" : ""}`} onClick={toggleWalkMode} aria-pressed={walkMode}>
              {lang === "hi" ? `चलने में मदद ${walkMode ? "चालू" : "बंद"}` : `Help me walk ${walkMode ? "ON" : "OFF"}`}
            </button>
            <button className="toggle" onClick={switchLanguage} aria-label={t.switchLanguage}>
              {lang === "en" ? "English" : "हिन्दी"}
            </button>
          </div>
          <div className="row">
            {torchOk && (
              <button className={`toggle ${torchOn ? "on" : ""}`} onClick={cycleTorch} aria-label={t.lightMode[torchMode]}>
                {lang === "hi"
                  ? `लाइट: ${torchMode === "auto" ? "अपने आप" : torchMode === "on" ? "चालू" : "बंद"}`
                  : `Light: ${torchMode === "auto" ? "Auto" : torchMode === "on" ? "On" : "Off"}`}
              </button>
            )}
            <button className="toggle" onClick={() => void stop()}>
              {lang === "hi" ? "बंद करें" : "Stop"}
            </button>
          </div>
          <button className="toggle" onClick={() => void toggleTutorial()} aria-pressed={tutorialOn}>
            {tutorialOn ? t.tutorialStop : t.tutorial}
          </button>
          <div className="debug-bar">
            <label>
              <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} /> debug
            </label>
            <span>{fps} fps</span>
            <span>
              {detectorBackend()} {detectorMedianMs() !== null && `${Math.round(detectorMedianMs()!)} ms`}
            </span>
            <span>cam: {camInfo}</span>
            <span>
              voice: {liveState}
              {connectMs !== null && ` (ready in ${connectMs} ms)`}
            </span>
            {(speechWakeSupported() || trainedWake) && (
              <label>
                <input type="checkbox" checked={wakeOn} onChange={(e) => toggleWake(e.target.checked)} /> hey netra
              </label>
            )}
            <span>wake: {wakeInfo}</span>
            {trainedWake && <span>wake score: {wakeScore}</span>}
            {routeInfo && <span>route: {routeInfo}</span>}
            <span>danger: {danger}</span>
            <span>cane: {cane.connected ? "on" : "off"}</span>
          </div>
        </section>
      )}
    </main>
  );
}
