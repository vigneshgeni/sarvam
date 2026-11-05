"""Hear the Gemini TTS voices without opening the app.

Run from the api/ folder on your Mac, after `gcloud auth application-default login`
(the Google account needs Vertex AI access, roles/aiplatform.user, and billing on the project):

    python tts_audition.py                       # English: every voice in both rotating pools
    python tts_audition.py --lang ta             # Tamil
    python tts_audition.py --lang hi --gender male
    python tts_audition.py --voices Kore,Puck    # any voice names from Google's list
    python tts_audition.py --model gemini-2.5-flash-tts

It uses the same code path as /api/speak (style prompt, sentence splitting, stitching), writes
WAV files to ./tts_audition/ and prints how long each voice took. It calls Google, so it is billed.
The sample sentences are plain test lines. Ask a native speaker to judge pronunciation.
"""

import argparse
import io
import os
import sys
import time
import wave

SAMPLES = {
    "en": "Your insurance premium of Rs. 31,200 is due on 30.11.2026. Please pay it before that date to keep your cover active.",
    "ta": "உங்கள் காப்பீட்டுத் தவணை 31,200 ரூபாய், 30 நவம்பர் 2026 அன்று செலுத்த வேண்டும். காப்பீடு தொடர்ந்து செயல்பட, அந்தத் தேதிக்கு முன் செலுத்தவும்.",
    "hi": "आपके बीमा की किस्त 31,200 रुपये है, जो 30 नवंबर 2026 तक भरनी है। बीमा चालू रखने के लिए कृपया इसे तारीख से पहले भर दें।",
    "te": "మీ బీమా ప్రీమియం 31,200 రూపాయలు, 30 నవంబర్ 2026 లోపు చెల్లించాలి. బీమా కొనసాగాలంటే ఆ తేదీకి ముందే చెల్లించండి.",
    "ml": "നിങ്ങളുടെ ഇൻഷുറൻസ് പ്രീമിയം 31,200 രൂപയാണ്, 2026 നവംബർ 30-നകം അടയ്ക്കണം. ഇൻഷുറൻസ് തുടരാൻ ആ തീയതിക്ക് മുമ്പ് അടയ്ക്കുക.",
    "kn": "ನಿಮ್ಮ ವಿಮಾ ಪ್ರೀಮಿಯಂ 31,200 ರೂಪಾಯಿ, 30 ನವೆಂಬರ್ 2026ರೊಳಗೆ ಪಾವತಿಸಬೇಕು. ವಿಮೆ ಮುಂದುವರಿಯಲು ಆ ದಿನಾಂಕದ ಮೊದಲು ಪಾವತಿಸಿ.",
    "mr": "तुमच्या विम्याचा हप्ता 31,200 रुपये आहे आणि तो 30 नोव्हेंबर 2026 पर्यंत भरायचा आहे. विमा सुरू राहण्यासाठी कृपया तारखेपूर्वी भरा.",
    "bn": "আপনার বিমার কিস্তি ৩১,২০০ টাকা, ৩০ নভেম্বর ২০২৬-এর মধ্যে দিতে হবে। বিমা চালু রাখতে অনুগ্রহ করে তারিখের আগে জমা দিন।",
}


def _seconds(wav_bytes: bytes) -> float:
    try:
        with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
            return wf.getnframes() / float(wf.getframerate())
    except Exception:
        return 0.0


def main() -> int:
    parser = argparse.ArgumentParser(description="Audition Gemini TTS voices")
    parser.add_argument("--lang", default="en", choices=sorted(SAMPLES))
    parser.add_argument("--gender", default="both", choices=["female", "male", "both"])
    parser.add_argument("--voices", default="", help="comma separated voice names instead of the pools")
    parser.add_argument("--model", default="", help="override GEMINI_TTS_MODEL")
    parser.add_argument("--text", default="", help="text to read instead of the sample")
    parser.add_argument("--out", default="tts_audition")
    args = parser.parse_args()

    if args.model:
        os.environ["GEMINI_TTS_MODEL"] = args.model

    import tts  # imported after the model override so it is picked up

    try:
        from google.cloud import texttospeech

        client = texttospeech.TextToSpeechClient()
    except Exception as exc:  # no credentials, wrong library version, and so on
        print(f"Could not create the Google client: {exc}")
        print("Run: gcloud auth application-default login")
        return 1

    genders = ["female", "male"] if args.gender == "both" else [args.gender]
    wanted = [v.strip() for v in args.voices.split(",") if v.strip()]
    text = args.text or SAMPLES[args.lang]
    os.makedirs(args.out, exist_ok=True)

    print(f"model={tts.gemini_tts_model()} lang={args.lang} ({tts.SPEAK_LANG_CODES[args.lang]})")
    failures = 0
    for gender in genders:
        names = []
        if wanted:
            catalogue = {n.lower(): n for n in tts._CATALOGUE[gender]}
            names = [catalogue[w.lower()] for w in wanted if w.lower() in catalogue]
        else:
            names = list(tts.voice_pool(gender))
        for name in names:
            # Force exactly this voice through the real production path
            os.environ[tts._VOICE_POOL_ENV[gender]] = name
            started = time.perf_counter()
            try:
                audio = tts.synthesize_speech(text, args.lang, gender, 1.0, client, voice_index=0)
            except Exception as exc:
                failures += 1
                print(f"  FAIL {gender:6} {name:14} {type(exc).__name__}: {str(exc)[:300]}")
                if "permission" in str(exc).lower() or "403" in str(exc):
                    print("       Needs roles/aiplatform.user, the Text-to-Speech API on, and billing.")
                continue
            took = time.perf_counter() - started
            path = os.path.join(args.out, f"{args.lang}_{gender}_{name}.wav")
            with open(path, "wb") as fh:
                fh.write(audio)
            print(f"  ok   {gender:6} {name:14} {took:5.1f}s to make {_seconds(audio):4.1f}s of audio -> {path}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
