// All spoken text, in English and Hindi. Labels are COCO class names (see vision/cocoLabels.ts).
import type { Lang, Proximity } from "../types";

export const SPEECH_LANG: Record<Lang, string> = { en: "en-IN", hi: "hi-IN" };

const LABELS_HI: Record<string, string> = {
  person: "व्यक्ति", bicycle: "साइकिल", car: "कार", motorcycle: "मोटरसाइकिल", airplane: "हवाई जहाज़", bus: "बस",
  train: "ट्रेन", truck: "ट्रक", boat: "नाव", "traffic light": "ट्रैफिक लाइट", "fire hydrant": "फायर हाइड्रेंट",
  "stop sign": "स्टॉप साइन", "parking meter": "पार्किंग मीटर", bench: "बेंच", bird: "चिड़िया", cat: "बिल्ली",
  dog: "कुत्ता", horse: "घोड़ा", sheep: "भेड़", cow: "गाय", elephant: "हाथी", bear: "भालू", zebra: "ज़ेबरा",
  giraffe: "जिराफ़", backpack: "बैकपैक", umbrella: "छाता", handbag: "हैंडबैग", tie: "टाई", suitcase: "सूटकेस",
  frisbee: "फ्रिस्बी", skis: "स्की", snowboard: "स्नोबोर्ड", "sports ball": "गेंद", kite: "पतंग",
  "baseball bat": "बैट", "baseball glove": "दस्ताना", skateboard: "स्केटबोर्ड", surfboard: "सर्फ़बोर्ड",
  "tennis racket": "रैकेट", bottle: "बोतल", "wine glass": "गिलास", cup: "कप", fork: "काँटा", knife: "चाकू",
  spoon: "चम्मच", bowl: "कटोरा", banana: "केला", apple: "सेब", sandwich: "सैंडविच", orange: "संतरा",
  broccoli: "ब्रोकली", carrot: "गाजर", "hot dog": "हॉट डॉग", pizza: "पिज़्ज़ा", donut: "डोनट", cake: "केक",
  chair: "कुर्सी", couch: "सोफ़ा", "potted plant": "गमले का पौधा", bed: "बिस्तर", "dining table": "मेज़",
  toilet: "टॉयलेट", tv: "टीवी", laptop: "लैपटॉप", mouse: "माउस", remote: "रिमोट", keyboard: "कीबोर्ड",
  "cell phone": "मोबाइल फ़ोन", microwave: "माइक्रोवेव", oven: "ओवन", toaster: "टोस्टर", sink: "सिंक",
  refrigerator: "फ्रिज", book: "किताब", clock: "घड़ी", vase: "फूलदान", scissors: "कैंची", "teddy bear": "टेडी बियर",
  "hair drier": "हेयर ड्रायर", toothbrush: "टूथब्रश",
};

export function labelName(label: string, lang: Lang): string {
  return lang === "hi" ? (LABELS_HI[label] ?? label) : label;
}

export type Side = "left" | "ahead" | "right";
export type SizeClass = "large" | "medium" | "small";

const SIDE: Record<Lang, Record<Side, string>> = {
  en: { left: "on your left", ahead: "ahead", right: "on your right" },
  hi: { left: "आपके बाईं ओर", ahead: "सामने", right: "आपके दाईं ओर" },
};
const PROX: Record<Lang, Record<Proximity, string>> = {
  en: { very_near: "very close", near: "close", far: "further away" },
  hi: { very_near: "बहुत पास", near: "पास", far: "थोड़ी दूर" },
};
const SIZE_ADJ: Record<Lang, Record<SizeClass, string>> = {
  en: { large: "large", medium: "medium-sized", small: "small" },
  hi: { large: "बड़ी", medium: "मध्यम आकार की", small: "छोटी" },
};

export const sideWord = (s: Side, lang: Lang) => SIDE[lang][s];
export const proxWord = (p: Proximity, lang: Lang) => PROX[lang][p];

export function distWord(m: number, lang: Lang): string {
  if (lang === "hi") return m < 1 ? "एक मीटर से कम" : `लगभग ${Math.round(m)} मीटर`;
  return m < 1 ? "less than a metre" : `about ${Math.round(m)} metres`;
}

/** "possibly a chair, a medium-sized object": the detector is unsure, so say what it may be and how big it is. */
export function maybePhrase(label: string, size: SizeClass, lang: Lang): string {
  const name = labelName(label, lang);
  return lang === "hi"
    ? `शायद ${name}, ${SIZE_ADJ.hi[size]} चीज़`
    : `possibly a ${name}, a ${SIZE_ADJ.en[size]} object`;
}

export const nothingSeen = (lang: Lang) =>
  lang === "hi" ? "मुझे अभी कोई पहचानी हुई चीज़ नहीं दिख रही।" : "I don't see any objects I recognise right now.";

export function crowdSummary(counts: { label: string; n: number }[], nearest: string, lang: Lang): string {
  const parts = counts.map(({ label, n }) =>
    lang === "hi" ? `${n} ${labelName(label, "hi")}` : `${n} ${label === "person" ? (n === 1 ? "person" : "people") : n === 1 ? label : `${label}s`}`,
  );
  return lang === "hi"
    ? `आसपास भीड़ है। ${parts.join(", ")}। सबसे पास: ${nearest}।`
    : `Crowded around you. ${parts.join(", ")}. Nearest: ${nearest}.`;
}

export const justNow = (desc: string, lang: Lang) => (lang === "hi" ? `अभी पास में था: ${desc}।` : `Just now: ${desc}.`);

/** Sentences the app speaks about itself. Functions so they can carry parameters. */
export const SYS = {
  en: {
    starting: "Starting Netra. Allow camera access.",
    startingShort: "Starting Netra.",
    allowMic: "Camera on. Allow microphone access for voice.",
    loadFirst: "Loading vision model for the first time. This can take up to a minute. Later starts are much faster.",
    loadKnown: (s: number) => `Loading vision model. This will take about ${s} seconds.`,
    ready: "Netra is ready.",
    noVibration: "Vibration is not supported on this phone.",
    noWakeLock: "Screen may turn off; keep it awake manually.",
    micOff: "Microphone is off, so voice questions are unavailable.",
    stopped: "Netra stopped. Tap the yellow button to start again.",
    quietOn: "Quiet mode on. Only alerts and answers.",
    quietOff: "Quiet mode off.",
    cameraDenied: "Camera permission was denied. Please allow camera access and tap again.",
    startFailed: "Could not start. Tap to try again.",
    liveDown: "Voice assistant is unavailable.",
    wakeDown: "Hey Netra listening is unavailable. Use double tap instead.",
    langSet: "English selected.",
    liveHint: "Reply in English.",
    liveProactive: (label: string) =>
      `The camera's object detector is unsure about something ahead. Its guess was "${label}", but that guess may well be wrong. Look at the camera image yourself and tell me briefly what is actually in front of me. Reply in English.`,
    tapToStart: "Tap anywhere on the screen to start Netra.",
    permCamera: "Netra needs the camera. Please tap Allow.",
    permCameraBlocked:
      "The camera is blocked. Open Chrome settings, then Site settings, then Camera, and allow this site. Netra will continue by itself.",
    permMic: "Netra needs the microphone. Please tap Allow.",
    permMicBlocked:
      "The microphone is blocked. Open Chrome settings, then Site settings, then Microphone, and allow this site. Netra will continue by itself.",
    tapAnywhere: "Netra is running. Tap anywhere to turn on voice.",
    cameraLost: "Camera stopped. Restarting.",
    cameraBack: "Camera back.",
    lightMode: { auto: "Light automatic.", on: "Light on.", off: "Light off." },
    lightAutoOn: "It is dark. Light turned on.",
    lightAutoOff: "It is bright. Light turned off.",
    lightFailed: "Could not switch the light.",
    askLight:
      "Netra can switch on the phone's flashlight by itself when it is dark, so it can see better. Allow this? Say yes or no, or tap the top half of the screen for yes, the bottom half for no.",
    lightAllowed: "Okay, the light will switch on by itself when it is dark.",
    lightDenied: "Okay, the light will stay off. You can change this with the Light button.",
    yes: "Yes",
    no: "No",
    tutorial: "Tutorial",
    tutorialStop: "Stop tutorial",
    tutorialFailed: "The tutorial could not be played. Check your internet and try again.",
    tutorialHint: "To hear how everything works, press the Tutorial button.",
    switchLanguage: "Switch language between English and Hindi",
  },
  hi: {
    starting: "नेत्र शुरू हो रहा है। कृपया कैमरा की अनुमति दें।",
    startingShort: "नेत्र शुरू हो रहा है।",
    allowMic: "कैमरा चालू। आवाज़ के लिए माइक की अनुमति दें।",
    loadFirst: "विज़न मॉडल पहली बार लोड हो रहा है। इसमें एक मिनट तक लग सकता है। अगली बार बहुत जल्दी होगा।",
    loadKnown: (s: number) => `विज़न मॉडल लोड हो रहा है। लगभग ${s} सेकंड लगेंगे।`,
    ready: "नेत्र तैयार है।",
    noVibration: "इस फ़ोन में वाइब्रेशन उपलब्ध नहीं है।",
    noWakeLock: "स्क्रीन बंद हो सकती है; कृपया उसे चालू रखें।",
    micOff: "माइक बंद है, इसलिए आवाज़ से सवाल नहीं पूछ सकते।",
    stopped: "नेत्र बंद हो गया। दोबारा शुरू करने के लिए पीला बटन दबाएँ।",
    quietOn: "शांत मोड चालू। सिर्फ़ चेतावनी और जवाब।",
    quietOff: "शांत मोड बंद।",
    cameraDenied: "कैमरा की अनुमति नहीं मिली। कृपया अनुमति दें और फिर से दबाएँ।",
    startFailed: "शुरू नहीं हो सका। फिर से दबाएँ।",
    liveDown: "आवाज़ वाला सहायक अभी उपलब्ध नहीं है।",
    wakeDown: "हे नेत्र सुनना उपलब्ध नहीं है। कृपया दो बार टैप करें।",
    langSet: "हिंदी चुनी गई।",
    liveHint: "हिंदी में जवाब दें।",
    liveProactive: (label: string) =>
      `कैमरे का डिटेक्टर सामने किसी चीज़ को लेकर अनिश्चित है। उसका अंदाज़ा "${label}" था, पर यह ग़लत भी हो सकता है। कैमरे की तस्वीर खुद देखकर संक्षेप में बताइए कि मेरे सामने असल में क्या है। हिंदी में जवाब दें।`,
    tapToStart: "नेत्र शुरू करने के लिए स्क्रीन पर कहीं भी टैप करें।",
    permCamera: "नेत्र को कैमरा चाहिए। कृपया अनुमति दें दबाएँ।",
    permCameraBlocked:
      "कैमरा बंद है। क्रोम की सेटिंग में साइट सेटिंग, फिर कैमरा खोलकर इस साइट को अनुमति दें। नेत्र अपने आप आगे बढ़ेगा।",
    permMic: "नेत्र को माइक्रोफ़ोन चाहिए। कृपया अनुमति दें दबाएँ।",
    permMicBlocked:
      "माइक्रोफ़ोन बंद है। क्रोम की सेटिंग में साइट सेटिंग, फिर माइक्रोफ़ोन खोलकर इस साइट को अनुमति दें। नेत्र अपने आप आगे बढ़ेगा।",
    tapAnywhere: "नेत्र चल रहा है। आवाज़ चालू करने के लिए स्क्रीन पर कहीं भी टैप करें।",
    cameraLost: "कैमरा बंद हो गया। दोबारा चालू कर रहे हैं।",
    cameraBack: "कैमरा वापस चालू।",
    lightMode: { auto: "लाइट अपने आप।", on: "लाइट चालू।", off: "लाइट बंद।" },
    lightAutoOn: "अंधेरा है। लाइट चालू कर दी।",
    lightAutoOff: "उजाला है। लाइट बंद कर दी।",
    lightFailed: "लाइट नहीं बदल सकी।",
    askLight:
      "अंधेरा होने पर नेत्र फ़ोन की टॉर्च अपने आप चालू कर सकता है, ताकि वह बेहतर देख सके। क्या आप अनुमति देते हैं? हाँ या नहीं बोलिए, या हाँ के लिए स्क्रीन का ऊपर वाला हिस्सा, नहीं के लिए नीचे वाला हिस्सा टैप कीजिए।",
    lightAllowed: "ठीक है, अंधेरा होने पर लाइट अपने आप चालू होगी।",
    lightDenied: "ठीक है, लाइट बंद रहेगी। आप लाइट बटन से इसे बदल सकते हैं।",
    yes: "हाँ",
    no: "नहीं",
    tutorial: "ट्यूटोरियल",
    tutorialStop: "ट्यूटोरियल रोकें",
    tutorialFailed: "ट्यूटोरियल नहीं चल सका। इंटरनेट जाँचकर फिर कोशिश करें।",
    tutorialHint: "सब कुछ कैसे काम करता है, यह सुनने के लिए ट्यूटोरियल बटन दबाएँ।",
    switchLanguage: "भाषा अंग्रेज़ी और हिंदी के बीच बदलें",
  },
} as const;

/** First-run question, spoken as two utterances so each is read by a voice of its own language. */
export const ASK_LANGUAGE = {
  en: "Welcome to Netra. Which language? Say English, or tap the top half of the screen.",
  hi: "नेत्र में आपका स्वागत है। हिंदी के लिए, हिंदी बोलिए या स्क्रीन का नीचे वाला हिस्सा टैप कीजिए।",
};

export type Sys = (typeof SYS)["en"];
