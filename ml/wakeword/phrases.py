# Phrase lists for the "Hey Netra" wake word dataset.

# Positives: what a user actually says to wake Netra.
POS_EN = ["Hey Netra", "Hey Nethra"]
POS_HI = ["हे नेत्रा"]

# Near-misses: short phrases that sound similar and must NOT wake Netra.
NEAR_MISS_EN = [
    "Hey there", "Hey nature", "Hey Neha", "Hey Netflix", "Hey Google", "Hey Siri", "Hey Nitra", "Hey Neeta",
    "Hey Alexa", "Hey bhai", "Hey Ram", "Hey Neetu", "Hey Natasha", "Hey Naresh", "Hey Meera", "Hey Netaji",
    "Hey net", "Hi Netra", "Okay Google", "Hello there", "Hey Nandu", "Hey Neel", "Hey Nira", "Netra",
    "Hey beta", "Hey brother", "Hey Nesta", "Hey Pitra", "Hey Mitra", "Hey Chhatra",
]
NEAR_MISS_HI = ["हे राम", "हे भगवान", "अरे सुनो", "अरे नेहा", "ओ भाई", "नमस्ते जी", "अरे भैया", "सुनिए ज़रा"]

# Ordinary speech: what the microphone hears the rest of the time.
SENT_EN = [
    "What time does the next bus come?",
    "Please give me two tickets to the station.",
    "The weather is very hot today.",
    "I will call you after lunch.",
    "Can you tell me where the market is?",
    "Mind the step, it is a bit slippery.",
    "How much does this cost?",
    "Turn left at the traffic signal.",
    "My phone battery is almost finished.",
    "We are going to the temple this evening.",
    "Please keep the door closed.",
    "Do you want some tea or coffee?",
    "The train is running late again.",
    "I need to buy vegetables and rice.",
    "He said the meeting starts at ten.",
    "Watch out for the auto rickshaw.",
    "Could you please speak a little slower?",
    "The shop closes at eight o'clock.",
    "She is waiting near the bus stop.",
    "I forgot my umbrella at home.",
    "Let us cross the road together.",
    "That was a really good movie.",
    "Please turn the volume down.",
    "Tomorrow is a holiday for the school.",
    "Where did you put the keys?",
    "The doctor will see you in five minutes.",
    "Thank you very much for your help.",
    "Do you know the way to the hospital?",
    "It is raining quite heavily outside.",
    "I would like a glass of water, please.",
    "The traffic on this road is terrible.",
    "My brother works in a bank.",
    "Please read the number on that board.",
    "Is this seat free or taken?",
    "We should leave early to avoid the crowd.",
    "The music is too loud in here.",
    "Can I pay with my phone?",
    "What is the date today?",
    "I think it is going to rain soon.",
    "Stay on the left side of the footpath.",
    "Sorry, I did not catch your name.",
    "The lift is not working today.",
    "He bought a new bicycle yesterday.",
    "Please wait here until I come back.",
    "The market is full of people on Sundays.",
    "I am hungry, let us get something to eat.",
    "That shop sells fresh fruits and juice.",
    "Open the window, it is getting warm.",
    "She teaches maths at the local school.",
    "Have you finished your homework yet?",
]
SENT_HI = [
    "आज मौसम बहुत अच्छा है।",
    "मुझे बाज़ार जाना है।",
    "बस कितने बजे आएगी?",
    "कृपया दरवाज़ा बंद कर दीजिए।",
    "आप कैसे हैं, सब ठीक है?",
    "मैं शाम को फ़ोन करूँगा।",
    "यह रास्ता स्टेशन की तरफ़ जाता है।",
    "चाय पीनी है या कॉफ़ी?",
    "बहुत ज़ोर की बारिश हो रही है।",
    "मुझे दो किलो चावल चाहिए।",
    "आगे सड़क पर बहुत भीड़ है।",
    "ज़रा संभलकर चलिए, यहाँ गड्ढा है।",
    "यह सब्ज़ी कितने की है?",
    "कल स्कूल की छुट्टी है।",
    "मेरा फ़ोन कहीं खो गया है।",
    "आप धीरे बोलिए, मुझे समझ नहीं आया।",
    "हम मंदिर जा रहे हैं।",
    "डॉक्टर साहब अभी आते हैं।",
    "खाना तैयार हो गया है।",
    "रिक्शा वाले से पूछ लीजिए।",
    "आज बहुत गर्मी है।",
    "मेरे भाई की दुकान पास में है।",
    "चलो अब घर चलते हैं।",
    "बच्चे पार्क में खेल रहे हैं।",
    "टिकट कहाँ मिलेगा?",
    "यह किताब बहुत दिलचस्प है।",
    "रास्ते में पुलिस खड़ी है।",
    "मुझे थोड़ा पानी दीजिए।",
    "दादी जी कहानी सुना रही हैं।",
    "आज ट्रेन देर से आएगी।",
    "सामान उठाने में मदद कर दो।",
    "पहले बाएँ मुड़िए, फिर सीधे जाइए।",
    "यह दवा खाने के बाद लेनी है।",
    "मुझे कल सुबह जल्दी उठना है।",
    "दुकान आठ बजे बंद हो जाती है।",
]
SENT_HINGLISH = [
    "Yaar, aaj bahut traffic hai.",
    "Bhaiya, ye kitne ka hai?",
    "Mujhe station jaana hai, rasta batao.",
    "Chai peeni hai ya coffee?",
    "Kal office jaana padega.",
    "Arre, phone ki battery khatam ho gayi.",
    "Chalo, ab ghar chalte hain.",
    "Wo bus abhi nikal gayi.",
    "Thoda aage left le lo.",
    "Mujhe do kilo aloo aur pyaaz chahiye.",
    "Aaj ka match dekha kya?",
    "Dukaan band ho gayi hai shayad.",
    "Please thoda dheere bolo na.",
    "Main ten minute mein pahunch raha hoon.",
    "Ye road bahut kharab hai.",
    "Kya tum market chal rahe ho?",
    "Aaj baarish hone wali hai.",
    "Bahut bhook lagi hai yaar.",
    "Wo auto wala kidhar gaya?",
    "Mera bag kahan rakha hai?",
    "Doctor ne kaha rest karo.",
    "Kal subah milte hain phir.",
    "Is gali mein bahut bheed hai.",
    "Gaadi side mein laga do.",
    "Mummy ne khana bana diya hai.",
    "Tum kitne baje aaoge?",
    "Ye shop sasti hai kya?",
    "Zara saamne dekhna, koi aa raha hai.",
    "Kal ka plan kya hai?",
    "Wifi ka password bata do.",
]


# ---- Extra ordinary speech, composed from parts for variety (acoustic variety matters more than meaning). ----
import random as _random

_NOUNS_EN = ["rice", "a ticket", "the bus", "my phone", "some water", "the key", "a newspaper", "the market", "a doctor",
             "the bank", "my bag", "tea", "the station", "a rickshaw", "the temple", "vegetables", "a blanket", "the school"]
_VERBS_EN = ["I need", "We want", "She bought", "He lost", "They found", "Please bring", "Can you see", "Where is",
             "I forgot", "Do you have", "Let us take", "He is looking for"]
_TAILS_EN = ["today", "right now", "after lunch", "in the evening", "tomorrow morning", "near the gate", "on the left",
             "before it rains", "for the family", ""]
_NOUNS_HI = ["चावल", "टिकट", "बस", "मेरा फ़ोन", "पानी", "चाबी", "अख़बार", "बाज़ार", "डॉक्टर", "बैंक", "बैग", "चाय", "स्टेशन",
             "रिक्शा", "मंदिर", "सब्ज़ी", "कंबल", "स्कूल"]
_FRAMES_HI = ["मुझे {} चाहिए।", "{} कहाँ मिलेगा?", "{} यहीं रख दो।", "क्या आपने {} देखा?", "कल {} लेकर आना।", "{} बहुत महँगा है।"]
_NOUNS_HG = ["chawal", "ticket", "bus", "mera phone", "paani", "chaabi", "akhbaar", "bazaar", "doctor", "bank", "bag", "chai",
             "station", "rickshaw", "mandir", "sabzi", "kambal", "school"]
_FRAMES_HG = ["Mujhe {} chahiye.", "{} kahan milega?", "{} yahin rakh do.", "Kya tumne {} dekha?", "Kal {} le aana.", "{} bahut mehenga hai."]
SHORT_UTT = [
    "Okay.", "Yes, sure.", "No problem.", "One minute.", "Excuse me.", "Thank you.", "Good morning.", "Good night.", "I see.",
    "Really?", "Come here.", "Wait a second.", "Let's go.", "Sounds good.", "Hello?", "Right.", "Hold on.", "Not now.",
    "हाँ जी।", "ठीक है।", "एक मिनट।", "चलिए।", "अरे वाह।", "रुकिए।", "धन्यवाद।", "नमस्ते।", "सुनिए।", "बिल्कुल।", "कोई बात नहीं।",
    "Haan ji.", "Theek hai.", "Ek minute.", "Chalo.", "Arre wah.", "Ruko zara.", "Shukriya.", "Kya hua?", "Accha.", "Bilkul.",
]


def extra_sentences(seed: int = 3):
    """Returns (lang, text) pairs: about 140 composed sentences plus short utterances."""
    rnd = _random.Random(seed)
    out = []
    for _ in range(45):
        out.append(("en-IN", f"{rnd.choice(_VERBS_EN)} {rnd.choice(_NOUNS_EN)} {rnd.choice(_TAILS_EN)}".strip() + "."))
    for _ in range(45):
        out.append(("hi-IN", rnd.choice(_FRAMES_HI).format(rnd.choice(_NOUNS_HI))))
    for _ in range(45):
        out.append(("en-IN", rnd.choice(_FRAMES_HG).format(rnd.choice(_NOUNS_HG))))
    for t in SHORT_UTT:
        out.append(("hi-IN" if any("ऀ" <= ch <= "ॿ" for ch in t) else "en-IN", t))
    return out


import re as _re

import hashlib as _hashlib


def _slug(t):
    a = _re.sub(r"[^a-z0-9]+", "_", t.lower()).strip("_")[:40]
    return a or "h" + _hashlib.md5(t.encode()).hexdigest()[:10]


NEAR_SLUGS = [_slug(t) for t in NEAR_MISS_EN + NEAR_MISS_HI]
