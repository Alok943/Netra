// The spoken tutorial: one short clip per feature, in English and Hindi.
// scripts/gen-tutorial.mjs turns this into audio (Sarvam text-to-speech) and a manifest under public/tutorial/.
// Keep every sentence short and plain: it is heard once, not read. Edit the text, then re-run the generator
// (only changed or missing clips are generated; delete a clip's file to force it again).
//
// Facts here must match the app: vibration patterns (src/reflex/haptics.ts), buttons and labels (src/App.tsx).

export const STEPS = [
  {
    id: "01-welcome",
    en: "Welcome to Netra. Netra is an assistant for people who cannot see well. It uses the phone's camera to notice objects around you, warns you by vibration, and talks to you when you ask. This tutorial has a few short parts. To stop at any time, press the Tutorial button again.",
    hi: "नेत्र में आपका स्वागत है। नेत्र उन लोगों के लिए सहायक है जिन्हें कम दिखता है या नहीं दिखता। यह फ़ोन के कैमरे से आसपास की चीज़ों को पहचानता है, कंपन से चेतावनी देता है, और आपके पूछने पर बात करता है। इस ट्यूटोरियल में कुछ छोटे हिस्से हैं। कभी भी रोकने के लिए ट्यूटोरियल बटन फिर से दबाएँ।",
  },
  {
    id: "02-starting",
    en: "Starting. Tap anywhere on the empty screen, or press the big yellow Start button. Netra asks for camera and microphone permission. When the question appears, choose Allow. The first time, Netra also asks which language you want. Say English or Hindi, or tap the top half of the screen for English, and the bottom half for Hindi. Loading can take up to a minute the first time.",
    hi: "शुरू करना। ख़ाली स्क्रीन पर कहीं भी टैप करें, या बड़ा पीला स्टार्ट बटन दबाएँ। नेत्र कैमरा और माइक की अनुमति माँगेगा। सवाल आने पर अनुमति दें चुनें। पहली बार नेत्र भाषा भी पूछता है। अंग्रेज़ी या हिंदी बोलिए, या अंग्रेज़ी के लिए स्क्रीन का ऊपर वाला हिस्सा और हिंदी के लिए नीचे वाला हिस्सा टैप कीजिए। पहली बार लोड होने में एक मिनट तक लग सकता है।",
  },
  {
    id: "03-holding",
    en: "Holding the phone. Hold the phone upright at chest height, with the camera facing forward, or hang it on a lanyard. Do not cover the camera lens with your finger. Keep Netra open on the screen. Do not press the power button, because when the screen locks, the camera can stop.",
    hi: "फ़ोन कैसे पकड़ें। फ़ोन को सीधा, छाती की ऊँचाई पर, कैमरा सामने की ओर रखें, या गले में लटकाएँ। कैमरे के लेंस पर उँगली न रखें। नेत्र को स्क्रीन पर खुला रखें। पावर बटन न दबाएँ, क्योंकि स्क्रीन लॉक होने पर कैमरा रुक सकता है।",
  },
  {
    id: "04-vibration",
    en: "Vibration warnings. Danger is told by vibration only, never by voice, so that it reaches you at once. Two soft taps mean an object is close, in your path. A rapid, strong buzz means something is very close. Three long pulses mean the camera has stopped. Learn these three feelings.",
    hi: "कंपन की चेतावनी। ख़तरे की सूचना सिर्फ़ कंपन से मिलती है, आवाज़ से नहीं, ताकि वह तुरंत मिले। दो हल्की थपकियों का मतलब है कि आपके रास्ते में कोई चीज़ पास है। तेज़, लगातार कंपन का मतलब है कि कोई चीज़ बहुत पास है। तीन लंबे कंपन का मतलब है कि कैमरा रुक गया है। इन तीनों को पहचानना सीख लें।",
  },
  {
    id: "05-announcements",
    en: "What Netra says. When a new object comes into your path, Netra tells you what it is, which side it is on, and about how far away. For example: chair, ahead, close, about two metres. If Netra says possibly, as in possibly a chair, it is not sure. Netra never vibrates for an object it is not sure about.",
    hi: "नेत्र क्या बोलता है। जब आपके रास्ते में कोई नई चीज़ आती है, तो नेत्र बताता है कि वह क्या है, किस तरफ़ है, और लगभग कितनी दूर है। जैसे: कुर्सी, सामने, पास, लगभग दो मीटर। अगर नेत्र कहे शायद, जैसे शायद कुर्सी, तो वह पक्का नहीं है। अनिश्चित चीज़ के लिए नेत्र कभी कंपन नहीं करता।",
  },
  {
    id: "06-talking",
    en: "Talking to Netra. Press the large Tap to talk button, or double tap the screen quickly. You will hear a chime and feel one short buzz. That means Netra is listening. Ask anything, for example: what is in front of me? Or: read this note. After the answer, Netra waits a few seconds for your next question, and then stops listening.",
    hi: "नेत्र से बात करना। बड़ा बोलिए बटन दबाएँ, या स्क्रीन पर जल्दी से दो बार टैप करें। आपको घंटी की आवाज़ सुनाई देगी और एक छोटा कंपन महसूस होगा। इसका मतलब है कि नेत्र सुन रहा है। कुछ भी पूछें, जैसे: मेरे सामने क्या है? या: यह पर्ची पढ़ दो। जवाब के बाद नेत्र कुछ सेकंड अगले सवाल का इंतज़ार करता है, फिर सुनना बंद कर देता है।",
  },
  {
    id: "07-safety",
    en: "An important safety rule. Netra will never tell you that a way is safe or clear, because the camera sees only what is straight ahead. If you ask, can I go right, Netra tells you what it can see there, and what it cannot see. Always check with your cane.",
    hi: "सुरक्षा का एक ज़रूरी नियम। नेत्र कभी नहीं कहेगा कि रास्ता सुरक्षित या साफ़ है, क्योंकि कैमरा सिर्फ़ सामने का हिस्सा देखता है। अगर आप पूछें कि क्या मैं दाईं ओर जा सकता हूँ, तो नेत्र बताएगा कि उसे वहाँ क्या दिख रहा है, और क्या नहीं दिख रहा। हमेशा अपनी छड़ी से भी जाँच लें।",
  },
  {
    id: "08-hey-netra",
    en: "Hey Netra. When this is switched on, you can say Hey Netra to start a conversation without touching the phone. It is still being tested, so the button is the reliable way.",
    hi: "हे नेत्र। अगर यह चालू है, तो आप फ़ोन को छुए बिना हे नेत्र बोलकर बात शुरू कर सकते हैं। यह अभी परीक्षण में है, इसलिए पक्का तरीका बटन ही है।",
  },
  {
    id: "09-quiet",
    en: "Quiet mode. The Quiet button stops Netra from speaking on its own. Vibration warnings and answers to your questions still come. Press the button again to turn Quiet mode off.",
    hi: "शांत मोड। शांत बटन नेत्र को अपने आप बोलने से रोकता है। कंपन की चेतावनी और आपके सवालों के जवाब फिर भी मिलते रहेंगे। बंद करने के लिए बटन फिर दबाएँ।",
  },
  {
    id: "10-language",
    en: "Language. The language button switches between English and Hindi at any time.",
    hi: "भाषा। भाषा बटन से आप कभी भी अंग्रेज़ी और हिंदी के बीच बदल सकते हैं।",
  },
  {
    id: "11-light",
    en: "Light. If your phone has a flashlight, the Light button goes through Auto, On and Off. In Auto, Netra switches the flashlight on by itself when it is dark, and tells you. The first time, Netra asks your permission.",
    hi: "लाइट। अगर आपके फ़ोन में टॉर्च है, तो लाइट बटन बारी-बारी से अपने आप, चालू और बंद चुनता है। अपने आप मोड में अंधेरा होने पर नेत्र टॉर्च ख़ुद चालू करता है और आपको बता देता है। पहली बार नेत्र आपसे अनुमति पूछता है।",
  },
  {
    id: "12-camera-stopped",
    en: "If the camera stops, for example after the screen locks or you switch to another app, Netra gives three long pulses and says: Camera stopped, restarting. Wait until you hear Camera back before you walk on.",
    hi: "अगर कैमरा रुक जाए, जैसे स्क्रीन लॉक होने या दूसरे ऐप में जाने के बाद, तो नेत्र तीन लंबे कंपन करता है और कहता है: कैमरा बंद हो गया, दोबारा चालू कर रहे हैं। कैमरा वापस चालू सुनने तक आगे न चलें।",
  },
  {
    id: "13-offline",
    en: "Without internet, the vibration warnings and the spoken object names keep working. Voice conversations need internet.",
    hi: "इंटरनेट के बिना भी कंपन की चेतावनी और चीज़ों के नाम बोलना चलता रहता है। आवाज़ वाली बातचीत के लिए इंटरनेट चाहिए।",
  },
  {
    id: "14-stop",
    en: "To finish, press the Stop button at the bottom. Netra says it has stopped. To start again, tap anywhere.",
    hi: "समाप्त करने के लिए नीचे बंद करें बटन दबाएँ। नेत्र बताएगा कि वह बंद हो गया। दोबारा शुरू करने के लिए कहीं भी टैप करें।",
  },
  {
    id: "15-end",
    en: "That is all. Netra is an aid. It does not replace your cane or your own judgement. You can hear this tutorial again at any time with the Tutorial button. Stay safe.",
    hi: "बस इतना ही। नेत्र एक सहायक है, यह आपकी छड़ी या आपकी अपनी समझ की जगह नहीं लेता। इस ट्यूटोरियल को आप कभी भी ट्यूटोरियल बटन से दोबारा सुन सकते हैं। सुरक्षित रहें।",
  },
];
