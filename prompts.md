# Netra: development prompts (edited for clarity)

> Edited for readability only: spelling, punctuation, grammar and structure. The meaning, content and order of the prompts are unchanged. The original, unedited log is kept by the team and is not published. Text quoted from the assistant's earlier replies is marked as such.

---

## 1. Project setup and architecture brief

Create a new project named "Netra" on the desktop (`C:\Users\aloks\Desktop`) and initialise a repository in it. Here is the summary:

> We are building "Netra" (originally called "Aankh"), a hackathon project: an always-on AI assistant for visually impaired users in India, built as a React PWA that runs in a phone browser. The phone is worn on the chest with the camera facing forward. Later, a smart cane with an ultrasonic sensor and a vibration motor will connect over Bluetooth, but for now the phone's vibration simulates the cane.
>
> **Architecture (3 tiers)**
> 1. **Tier 0, reflexes (on-device, always on, free):** TensorFlow.js COCO-SSD (or YOLO nano if easy) runs on camera frames in the browser. Close obstacles trigger vibration patterns through `navigator.vibrate` (different patterns for near and very near), never audio. Never route danger alerts through any API.
> 2. **Router:** on events (user speaks, a new object appears, the scene changes, a text-like region is detected), build a small text state (the user's transcribed query, language, a detection summary with labels, distance and confidence, the last route, network status) and ask TypeSafe Jev (`POST https://api.typesafe.ai/v1/systemone`, model `jev-latest`) two questions: "should the assistant speak now?" and "which handler: rule_reply or gemini_live?". Jev returns calibrated probabilities. Route only if confidence is above 0.8, otherwise default to `gemini_live`. If Jev fails or takes more than 1.5 s, fall back to simple keyword rules. Never send frames to Jev.
> 3. **Handler:** the Gemini Live API (model from an environment variable, for example `gemini-3.1-flash-live-preview`) for natural Hindi and English voice conversation. Send camera frames (JPEG, about 1 fps) only while a routed query is active. Stream mic audio only when voice activity is detected, to control cost.
>
> **Priority:** danger (vibration, interrupts everything) > user query > proactive information (disabled in quiet mode).
>
> **Tech requirements**
> - Vite, React and TypeScript, mobile-first, with a large high-contrast UI and minimal buttons (one big tap-to-talk button and a quiet-mode toggle). Everything is announced by voice.
> - PWA: manifest and service worker so it installs through "Add to Home Screen". Use the Screen Wake Lock API.
> - A small Node/Express (or Vercel serverless) backend that holds `GEMINI_API_KEY` and `TYPESAFE_API_KEY`, issues ephemeral tokens for Gemini Live, and proxies Jev calls. No API keys in frontend code.
> - Deployable to Vercel over HTTPS (needed for camera and microphone on phones).
> - Check the official docs for the Gemini Live API (audio formats, session setup, ephemeral tokens) and for TypeSafe Jev (request schema) instead of guessing.
>
> Start with Phase 0 and Phase 1 only: project scaffold, backend skeleton with environment variables, camera feed, COCO-SSD detection with bounding boxes on a debug overlay, distance estimation from box size, and vibration alerts. Leave clean interfaces (stubs) for the router and the Gemini Live handler, plus a stub for a future Web Bluetooth cane connection. Tell me how to run it locally and how to test it on my phone.

I have attached `test-keys.mjs` and I have the keys. How do I put them into the files? Let's start building, and ask me questions if you need clarification.

Key-check output (pasted):

```
=== Gemini ===
Key OK. 62 models visible.
Live-capable models (use one of these in GEMINI_LIVE_MODEL):
  - gemini-3.5-transcribe-live
  - gemini-2.5-flash-native-audio-latest
  - gemini-2.5-flash-native-audio-preview-09-2025
  - gemini-2.5-flash-native-audio-preview-12-2025
  - gemini-3.1-flash-live-preview
  - gemini-3.8-live
  - gemini-3.8-live-extended-thinking
  - gemini-robotics-er-2-streaming-preview
  - gemini-3.5-live-translate-preview

=== Jev (TypeSafe) ===
Key OK. Latency: 480 ms
{ "model": "jev-1.13.0",
  "answers": {
    "route": { "type": "choice", "choice": "gemini_live", "confidence": 0.98,
               "probabilities": { "rule_reply": 0.01, "gemini_live": 0.99 } },
    "speak_now": { "type": "noul", "noul": 0.7 } },
  "usage": { "input_tokens": 408, "output_tokens": 55 } }
```

## 2. Model choice and the talk button

Please write a document. Read the docs for `gemini-3.1-flash-live-preview` and tell me whether `gemini-3.8-live` is suitable. Also, why is there a talk button, and how would a blind person use it?

## 3. Camera placement and detection models

We will not primarily use a phone strapped to the chest. At best, what height and overall field of view can a good-quality camera at about 3.5 feet cover?

Next: can I use better object detection models on low-budget smartphones?

## 4. Working style, and the stick

From now on, do not write code; give me documents only. I will use smaller capable models to reduce token usage.

If you have ideas to improve the use case of this project, suggest them. It should also activate when the user says "Netra", for queries, assuming we have the stick with a good camera and sensors such as depth.

## 5. Stage 1 fixes

Implement `docs/stage-1-fixes.md`.

## 6. Deploy for phone testing

I am testing on the Vercel link on my phone, so deploy to Vercel first.

## 7. First phone results

The frame rate was 6 to 7 fps (WebGPU, YOLO nano 416, 131 ms per frame). Routing through Jev gave wrong answers. Also add an option to turn on the flashlight, automatically when it is dark.

## 8. Flashlight permission, a wrong answer, and designing for blind users

The torch should turn on automatically, or ask permission the first time to keep it on auto.

About the wrong answers: there was an obstacle on the right, I asked the model whether I could go right, and it said yes.

Also, I want the app to be designed for use by a blind person. I do not know how blind people use phones, so please explain.

## 9. Accessibility plan and tutorial

We will implement this (notes on screen readers):

> TalkBack on Android and VoiceOver on iPhone are the screen readers most blind users rely on. The phone speaks whatever is under the user's finger. A single tap only reads the item; a double-tap activates it; swiping right or left moves to the next or previous item; a two-finger swipe scrolls; "screen curtain" turns the display black while the phone keeps working.

Questions and requests:

- All buttons should eventually be voice activated and controllable from a button on the stick. Since we do not have the hardware yet, we will use on-screen buttons for now. Is that right?
- Is camera access restricted only on the phone, and not on the stick?
- Add a "Netra is listening" earcon and haptic when the voice session opens.
- Before testing with TalkBack and with blind users, record voices with Sarvam and create a tutorial for every feature.

## 10. First words, latency and timing

The first thing the app says should be "Welcome to Netra", followed by asking the user to choose a language.

How should we manage the latency of the Gemini Live API, and how long after opening a session should the user wait before asking "Can I go right?"

## 11. Deploy, and a speech-recognition idea

Deploy. Also, what do you think of this suggestion?

> The next speed improvement is replacing Chrome's generic speech recognition with Sarvam realtime speech-to-text or a local command model. Sarvam's partial transcript can identify "read", "sign" or "describe" while the person is still speaking, which lets Netra warm up Gemini only for complex requests.

## 12. Reducing Gemini cost

I spent 70 rupees on testing, so I cannot present this to the judges as expensive. What alternatives are there? For example, I could offer a basic tier without the assistant. Are there other ways to reduce the cost?

## 13. Always-on listening and on-device models

I used "Hey Netra" the way I use a live voice assistant like GPT normally. Can the microphone stay always on, so that I ask a question and an on-device model answers? Is there any model that runs on the device?

## 14. Hands-free wake word and battery

That design belongs in the docs. How does "Hey Google" work, and does it also use a lot of battery?

## 15. README and the role of Jev

Update the README to describe the current functioning of the code, with limitations and future scope. I will then make the presentation. Also, explain exactly how Jev is used in real time; it is still not clear to me.

## 16. Jev and low detector confidence

If the YOLO confidence is already low, does Jev then give an answer and send the request to Gemini? And apart from "Hey Netra", when is Gemini accessed?

## 17. Jev confidence scenarios

When the YOLO confidence is low, in what scenarios would Jev's confidence be below 80 percent? Tell me what you think.

## 18. Calibration test

Create and run a test to calibrate Jev's confidence, and store the inputs and outputs in a test file.

## 19. Presentation requirements

The presentation should contain:

- the architecture, including which model is used for what purpose;
- the GitHub repository link and the website link;
- framing as an object detection system with a real-time voice assistant, not as an "AI assistant";
- the team name, Neotattva;
- fewer pages, "stick" instead of "cane", a mention of the assistant, and a description of the app's UX at the beginning;
- near the end: the problems the stick would solve; that the phone camera is used for now, and that a stick camera with NPUs will later run powerful models locally;
- what could not be achieved because the stick was not ready, and that depth and distance of objects could not be fixed because of web page restrictions, plus other problems;
- the depth sensor's role for open drains, potholes, pits, roof edges and similar hazards;
- on the last slide, the members: Alok Singh, Gaurav Soni, Ajendra Singh and Parag.

## 20. Presentation revisions

On the second slide, state the problem statement, the current solutions and what is unique in our approach. Also give the number of voice clips used, where Sarvam bulbul is mentioned. Remove page 6, page 7 is too dense, and use the whole page on page 9. Try to fit everything into 6 pages.

## 21. Wake-word variations

Can I generate different versions of "Hey Netra" using a speech-to-text API, or Sarvam?

## 22. Wake word for the MVP

Can you do it if I give you the Sarvam API key? Or, for the MVP, we can use the simple "Hey Netra" for now and leave the trained one as future scope, since the object detection part on the phone comes first.

## 23. Test the updated detection

Is the object detection updated? Let's test it on the phone too, because it has a clearer camera than the PC.

## 24. Detection works, speech does not

Object detection works fine for now, but text-to-speech is not working: it does not speak about the current environment. This was over Wi-Fi.

## 25. What gets announced

Objects outside the middle half of the view are never announced, and objects at very-near range get vibration only, with no speech. It should say what the object may be and, if that is not clear, its size.

Before anything else, ask the user for the language. Also, how can we fix the camera and microphone permissions without needing a click? After deploying I think the latency will go down. And in a crowded area, how will the announcements decide what to speak?

## 26. Walking track, language and permissions

Yes, I want a track marked on the screen. It may not help the judges evaluate, but if an object comes inside that area, it should be announced.

Quoted from the assistant's earlier reply, with my notes:

> First start: it asks "Which language?" in both languages. You answer by voice ("English" or "Hindi"), or by tapping the top half of the screen for English and the bottom half for Hindi. **(done)**
>
> The whole screen is now the Start button, so one tap anywhere starts it. In Chrome's site settings, set camera and microphone to Allow for the site (a sighted helper does this once), and Chrome never asks again. Installing the app to the home screen helps too. **(done)**

Fix these first, and state clearly what is routed to Gemini, and when.

## 27. Local routing, later

Quoted from the assistant:

> A spoken question goes straight to Gemini, so Jev is not used for questions yet, and every question uses the network. I could instead turn the question into text, let Jev route simple ones like "what's in front of me?" to the on-device description, and send only harder ones (reading text, notes, bus numbers) to Gemini. That would be faster, free and work offline. Want me to build it?

We can do this later. Next is deploying.

## 28. Permission prompts and late speech

If camera access fails, the prompt does not appear again. Both permission prompts should be shown again and again until they are granted. Also, why does the speech start late after opening the app?

## 29. Resetting permissions

The app asks me to grant permissions from the settings. How should I reset them so that the prompt appears on screen, and how do I reload the app?

## 30. System voice and Jev output

First of all, I need a clear, distinct voice that announces that the assistant has started. Also, is Jev giving outputs that are converted to speech?
