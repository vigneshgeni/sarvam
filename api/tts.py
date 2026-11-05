import concurrent.futures
import io
import logging
import os
import random
import re
import threading
import time
import wave
from typing import Any, Dict, List, Optional, Tuple

RUPEE_WORDS = {
    "en": "rupees",
    "ta": "ரூபாய்",
    "hi": "रुपये",
    "te": "రూపాయలు",
    "ml": "രൂപ",
    "kn": "ರೂಪಾಯಿ",
}

MONTH_NAMES_EN = {
    1: "January", 2: "February", 3: "March", 4: "April",
    5: "May", 6: "June", 7: "July", 8: "August",
    9: "September", 10: "October", 11: "November", 12: "December"
}

MONTH_NAMES_TA = {
    1: "ஜனவரி", 2: "பிப்ரவரி", 3: "மார்ச்", 4: "ஏப்ரல்",
    5: "மே", 6: "ஜூன்", 7: "ஜூலை", 8: "ஆகஸ்ட்",
    9: "செப்டம்பர்", 10: "அக்டோபர்", 11: "நவம்பர்", 12: "டிசம்பர்"
}

MONTH_NAMES_HI = {
    1: "जनवरी", 2: "फ़रवरी", 3: "मार्च", 4: "अप्रैल",
    5: "मई", 6: "जून", 7: "जुलाई", 8: "अगस्त",
    9: "सितंबर", 10: "अक्टूबर", 11: "नवंबर", 12: "दिसंबर"
}

MONTH_NAMES_TE = {
    1: "జనవరి", 2: "ఫిబ్రవరి", 3: "మార్చి", 4: "ఏప్రిల్",
    5: "మే", 6: "జూన్", 7: "జూలై", 8: "ఆగస్టు",
    9: "సెప్టెంబరు", 10: "అక్టోబరు", 11: "నవంబరు", 12: "డిసెంబరు"
}

MONTH_NAMES_ML = {
    1: "ജനുവരി", 2: "ഫെബ്രുവരി", 3: "മാർച്ച്", 4: "ഏപ്രിൽ",
    5: "മേയ്", 6: "ജൂൺ", 7: "ജൂലൈ", 8: "ഓഗസ്റ്റ്",
    9: "സെപ്റ്റംബർ", 10: "ഒക്ടോബർ", 11: "നവംബർ", 12: "ഡിസംബർ"
}

MONTH_NAMES_KN = {
    1: "ಜನವರಿ", 2: "ಫೆಬ್ರವರಿ", 3: "ಮಾರ್ಚ್", 4: "ಏಪ್ರಿಲ್",
    5: "ಮೇ", 6: "ಜೂನ್", 7: "ಜುಲೈ", 8: "ಆಗಸ್ಟ್",
    9: "ಸೆಪ್ಟೆಂಬರ್", 10: "ಅಕ್ಟೋಬರ್", 11: "ನವೆಂಬರ್", 12: "ಡಿಸೆಂಬರ್"
}


def render_iso_dates_natural(text: str, lang: str = "en") -> str:
    """
    Renders any ISO date (YYYY-MM-DD) in natural target language form.
    E.g. 2026-11-30 in hi -> '30 नवंबर 2026', in ta -> '30 நவம்பர் 2026'.
    Never leaves YYYY-MM-DD in spoken summaries.
    """
    if not text:
        return text

    norm_lang = (lang or "en").lower().split("-")[0]

    def replace_iso(m):
        y_str = m.group(1)
        m_str = m.group(2)
        d_str = m.group(3)
        try:
            year = int(y_str)
            month = int(m_str)
            day = int(d_str)
            if not (1 <= day <= 31 and 1 <= month <= 12 and 1900 <= year <= 2100):
                return m.group(0)

            if norm_lang == "hi":
                return f"{day} {MONTH_NAMES_HI.get(month, m_str)} {year}"
            elif norm_lang == "ta":
                return f"{day} {MONTH_NAMES_TA.get(month, m_str)} {year}"
            elif norm_lang == "te":
                return f"{day} {MONTH_NAMES_TE.get(month, m_str)} {year}"
            elif norm_lang == "ml":
                return f"{day} {MONTH_NAMES_ML.get(month, m_str)} {year}"
            elif norm_lang == "kn":
                return f"{day} {MONTH_NAMES_KN.get(month, m_str)} {year}"
            else:
                return f"{day} {MONTH_NAMES_EN.get(month, m_str)} {year}"
        except Exception:
            return m.group(0)

    return re.sub(r"(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)", replace_iso, text)

LAKH_WORDS = {
    "en": "lakh",
    "ta": "லட்சம்",
    "hi": "लाख",
    "te": "లక్ష",
    "ml": "ലക്ഷം",
    "kn": "ಲಕ್ಷ",
}

CRORE_WORDS = {
    "en": "crore",
    "ta": "கோடி",
    "hi": "करोड़",
    "te": "కోటి",
    "ml": "കോടി",
    "kn": "ಕೋಟಿ",
}

# --- Gemini TTS (Cloud Text-to-Speech, Gemini voices) ---------------------------------------
# Languages Listen can speak, and the BCP-47 code sent to Gemini TTS for each.
# Source: Google Cloud "Gemini-TTS" page. hi, ta, te, mr, en-IN are GA there; ml, kn are Preview.
# Bengali is listed only as bn-BD (Bangladesh); no bn-IN is listed, so bn-BD is used.
# Odia is not offered by the app (no Listen), see synthesize_speech.
SPEAK_LANG_CODES: Dict[str, str] = {
    "ta": "ta-IN",
    "hi": "hi-IN",
    "te": "te-IN",
    "ml": "ml-IN",
    "kn": "kn-IN",
    "en": "en-IN",
    "mr": "mr-IN",
    "bn": "bn-BD",
}

# Default model. Override with GEMINI_TTS_MODEL (for example gemini-2.5-flash-tts, which is GA).
DEFAULT_GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview"

# Every Gemini TTS voice name the Google page lists, by gender.
GEMINI_FEMALE_VOICES = (
    "Achernar", "Aoede", "Autonoe", "Callirrhoe", "Despina", "Erinome", "Gacrux", "Kore",
    "Laomedeia", "Leda", "Pulcherrima", "Sulafat", "Vindemiatrix", "Zephyr",
)
GEMINI_MALE_VOICES = (
    "Achird", "Algenib", "Algieba", "Alnilam", "Charon", "Enceladus", "Fenrir", "Iapetus",
    "Orus", "Puck", "Rasalgethi", "Sadachbia", "Sadaltager", "Schedar", "Umbriel",
    "Zubenelgenubi",
)

# Voices that rotate for each Listen session. Chosen for a calm, clear, warm read of documents
# (not the excitable, breathy or gravelly ones). Swap them without a code change with
# SARVAM_TTS_FEMALE_VOICES / SARVAM_TTS_MALE_VOICES (comma separated names from the lists above).
DEFAULT_VOICE_POOLS: Dict[str, Tuple[str, ...]] = {
    "female": ("Sulafat", "Erinome", "Despina"),
    "male": ("Charon", "Iapetus", "Sadaltager"),
}
_VOICE_POOL_ENV = {
    "female": "SARVAM_TTS_FEMALE_VOICES",
    "male": "SARVAM_TTS_MALE_VOICES",
}
_CATALOGUE = {"female": GEMINI_FEMALE_VOICES, "male": GEMINI_MALE_VOICES}

# Gemini TTS accepts at most 4,000 bytes of text and 4,000 of prompt (8,000 combined).
# Indic scripts use 3 bytes per character, so keep each call well under the limit.
_MAX_TEXT_BYTES = 3000

_LANGUAGE_NAMES = {
    "en": "English with a natural Indian accent",
    "ta": "Tamil",
    "hi": "Hindi",
    "te": "Telugu",
    "ml": "Malayalam",
    "kn": "Kannada",
    "mr": "Marathi",
    "bn": "Bengali",
}

logger = logging.getLogger("sarvam-api")


def gemini_tts_model() -> str:
    """Model id sent as model_name. Read on every call so it can be changed with an env var."""
    return (os.environ.get("GEMINI_TTS_MODEL") or "").strip() or DEFAULT_GEMINI_TTS_MODEL


def voice_pool(gender: str) -> Tuple[str, ...]:
    """The rotating voices for a gender. Env override names are checked against Google's list."""
    key = "male" if gender == "male" else "female"
    raw = os.environ.get(_VOICE_POOL_ENV[key], "")
    wanted = [part.strip() for part in raw.split(",") if part.strip()]
    by_lower = {name.lower(): name for name in _CATALOGUE[key]}
    pool: List[str] = []
    for name in wanted:
        canonical = by_lower.get(name.lower())
        if canonical is None:
            logger.warning("tts_voice_pool: ignoring unknown %s voice %r", key, name)
        elif canonical not in pool:
            pool.append(canonical)
    return tuple(pool) if pool else DEFAULT_VOICE_POOLS[key]


def choose_voice(gender: str, variant: Optional[int] = None) -> str:
    """Pick one voice name. The client sends the same variant for a whole Listen session, so the
    voice never changes on pause, resume, replay, seek or speed. Without a variant, pick at random."""
    pool = voice_pool(gender)
    if variant is None:
        return random.choice(pool)
    return pool[variant % len(pool)]


def style_prompt(lang: str = "en", rate: float = 1.0) -> str:
    """Natural-language direction for the voice (sent in the prompt field, never spoken)."""
    language = _LANGUAGE_NAMES.get(lang, "English with a natural Indian accent")
    if rate <= 0.9:
        pace = "a little slower than normal conversation"
    elif rate >= 1.15:
        pace = "a little faster than normal conversation"
    else:
        pace = "an unhurried, conversational pace"
    return (
        f"Read the following aloud in {language}, as a warm, calm and caring person explaining "
        "an important document to someone who may be worried about it. "
        f"Speak at {pace} with clear pronunciation. "
        "Let your tone follow the meaning: steady and serious for deadlines, penalties and "
        "warnings, gently reassuring for good news, and neutral for plain facts. "
        "Say amounts and dates clearly, with slight emphasis so they are easy to catch. "
        "Sound expressive and human, never robotic and never dramatic."
    )


def to_speech(text: str, lang: str = "en") -> str:
    """
    Prepares text for TTS synthesis in code.
    - 'Rs. 1,200', 'INR 5,000', ₹ -> amount + rupee word per language
    - 'Rs.5 Lac' / '5 Lakh' -> '5 lakh rupees' (or native lakh/rupee terms)
    - Dates '30.11.2026' or '02-10-2026' -> expanded with month names for en, ta, hi
    - For te, ml, kn: keeps digits and rupee word.
    """
    if not text:
        return ""

    norm_lang = (lang or "en").lower().split("-")[0]
    rupee_word = RUPEE_WORDS.get(norm_lang, "rupees")
    lakh_word = LAKH_WORDS.get(norm_lang, "lakh")
    crore_word = CRORE_WORDS.get(norm_lang, "crore")

    out = text

    # Honorifics are speech-only expansions. In particular, a bare "Dr" can
    # otherwise be pronounced as "driver" by the English voice.
    doctor_words = {
        "en": "Doctor", "ta": "டாக்டர்", "hi": "डॉक्टर",
        "te": "డాక్టర్", "ml": "ഡോക്ടർ", "kn": "ಡಾಕ್ಟರ್",
    }
    out = re.sub(
        r"\bDr\.?(?=\s+[^\W\d_])",
        doctor_words.get(norm_lang, "Doctor"),
        out,
    )
    out = re.sub(r"\b([A-Z])\.(?=\s+[A-Z][a-z])", r"\1", out)

    # 1. Expand Lac / Lakh / Crore amounts
    # e.g. "Rs. 5 Lac", "Rs.5 Lacs", "₹ 5 Lakh", "INR 10 Crore"
    def replace_lakh_crore(m):
        amt = m.group(1).strip()
        unit = m.group(2).lower()
        u_word = crore_word if "cr" in unit else lakh_word
        return f"{amt} {u_word} {rupee_word}"

    out = re.sub(
        r"(?:Rs\.?|INR|₹|ரூ\.?|रु\.?)\s*(\b\d+(?:\.\d+)?)\s*(lacs?|lakhs?|crores?|cr\b)",
        replace_lakh_crore,
        out,
        flags=re.IGNORECASE,
    )

    # Bare "5 Lac" / "5 Lakh" without prefix
    def replace_bare_lakh(m):
        amt = m.group(1).strip()
        unit = m.group(2).lower()
        u_word = crore_word if "cr" in unit else lakh_word
        return f"{amt} {u_word} {rupee_word}"

    out = re.sub(
        r"\b(\d+(?:\.\d+)?)\s*(lacs?|lakhs?|crores?)\b",
        replace_bare_lakh,
        out,
        flags=re.IGNORECASE,
    )

    # 2. Expand standard currency amounts
    # e.g. "Rs. 1,200", "Rs 1,200", "INR 5,000", "₹ 31,200", "₹31200", "ரூ. 1200", "रु. 1200"
    def replace_amount(m):
        num_str = m.group(1).strip()
        return f"{num_str} {rupee_word}"

    out = re.sub(
        r"(?:Rs\.?|INR|₹|ரூ\.?|रु\.?)\s*([\d,]+(?:\.\d+)?)",
        replace_amount,
        out,
        flags=re.IGNORECASE,
    )

    # Rupee word attached after amount, e.g. "1,200 Rs", "5000 INR"
    out = re.sub(
        r"([\d,]+(?:\.\d+)?)\s*(?:Rs\.?|INR|ரூ\.?|रु\.?)",
        rf"\1 {rupee_word}",
        out,
        flags=re.IGNORECASE,
    )

    # 3. Expand dates like 30.11.2026, 02-10-2026, 2026-10-01
    # For en, ta, hi: expand month name. For te, ml, kn: keep digits as instructed.
    def replace_date(m):
        d_str = m.group(1)
        m_str = m.group(2)
        y_str = m.group(3)
        try:
            day = int(d_str)
            month = int(m_str)
            year = int(y_str)
            if not (1 <= day <= 31 and 1 <= month <= 12 and 1900 <= year <= 2100):
                return m.group(0)

            if norm_lang == "ta":
                month_name = MONTH_NAMES_TA.get(month, m_str)
                return f"{day} {month_name} {year}"
            elif norm_lang == "hi":
                month_name = MONTH_NAMES_HI.get(month, m_str)
                return f"{day} {month_name} {year}"
            elif norm_lang == "en":
                month_name = MONTH_NAMES_EN.get(month, m_str)
                return f"{day} {month_name} {year}"
            else:
                # For te, ml, kn: keep digits
                return f"{day:02d}-{month:02d}-{year}"
        except Exception:
            return m.group(0)

    # Matches DD.MM.YYYY, DD-MM-YYYY, DD/MM/YYYY
    out = re.sub(
        r"\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b",
        replace_date,
        out,
    )

    # Matches YYYY-MM-DD
    out = render_iso_dates_natural(out, norm_lang)

    # Clean up whitespace
    out = re.sub(r"[ \t]+", " ", out).strip()
    return out


COMMON_ACRONYMS = {
    "GST", "UPI", "EMI", "PAN", "OTP", "IMEI", "TDS", "IRDAI", "EPFO",
    "PDF", "SMS", "INR", "UID", "IFSC", "MICR", "NEFT", "RTGS", "IMPS",
    "ICICI", "HDFC", "SBI", "LIC", "ATM", "PIN", "NOC", "FIR", "KYC",
    "OAP", "PPO", "DOB", "ID", "DL", "RC", "AI", "ML", "TTS", "API",
    "HTTP", "HTTPS", "JSON", "URL", "POL", "CLM", "REF", "INV", "DOC", "MRN",
}


def normalize_caps_and_ids(text: str) -> str:
    """
    Normalizes ALL-CAPS words (>= 3 chars) not in allowlist to Title Case,
    and inserts space between letters and digits in alphanumeric IDs so TTS
    reads them naturally instead of garbling or spelling out words.
    """
    if not text:
        return text

    # Insert space between letter run and digit run in alphanumeric IDs
    text = re.sub(r"([A-Za-z]{2,})(\d+)", r"\1 \2", text)
    text = re.sub(r"(\d+)([A-Za-z]{2,})", r"\1 \2", text)

    # Convert ALL-CAPS words (>= 3 chars) not in allowlist to Title Case
    def convert_word(m):
        w = m.group(0)
        if w in COMMON_ACRONYMS:
            return w
        return w.capitalize()

    text = re.sub(r"\b[A-Z]{3,}\b", convert_word, text)
    return text


ABBR_PATTERN = (
    r"(?i)\b(?:rs|no|dr|mr|mrs|ms|smt|sri|shri|st|pvt|ltd|approx|appx|dept|est|vs|vol|ரூ|रु|क्र|सं)\."
)


def split_sentences(text: str) -> List[str]:
    """
    Splits text into natural sentences without breaking on Indian currency (Rs., ரூ., रु.),
    honorifics (Dr., Mr., Mrs., Smt., Shri), abbreviations (No., Ref., St., approx.),
    initials (R. Kumar), decimals (48,500.00), or dates (30.11.2026).
    Handles danda (।) and double danda (॥).
    """
    if not text:
        return []

    # Protect decimals: 48,500.00 or 9.2
    s = re.sub(r"(\d)\.(\d)", r"\1<NUMDOT>\2", text)

    # Protect abbreviations
    s = re.sub(ABBR_PATTERN, lambda m: m.group(0)[:-1] + "<ABBRDOT>", s)

    # Protect single uppercase initials: e.g. "R. Kumar"
    s = re.sub(r"\b([A-Z])\.(?=\s+[A-Za-z])", r"\1<INITDOT>", s)

    # Protect e.g. / i.e. / a.m. / p.m.
    s = re.sub(r"(?i)\b([a-z])\.([a-z])\.", r"\1<ABBRDOT>\2<ABBRDOT>", s)

    # Split on [.!?।॥\n]+ followed by whitespace or end of string
    parts = re.split(r"([.!?।॥\n]+(?:\s+|$))", s)

    sentences: List[str] = []
    i = 0
    while i < len(parts):
        chunk = parts[i]
        punct = parts[i + 1] if i + 1 < len(parts) else ""
        i += 2
        full = (chunk + punct).strip()
        full = full.replace("<NUMDOT>", ".").replace("<ABBRDOT>", ".").replace("<INITDOT>", ".")
        if full:
            sentences.append(full)

    return sentences


def stitch_wavs(wav_list: List[bytes], silence_ms: int = 250, rate: int = 24000) -> bytes:
    """
    Stitches multiple WAV PCM streams together with silence padding in between.
    Rewrites a single valid standard 44-byte WAV RIFF header.
    """
    if not wav_list:
        return b""
    if len(wav_list) == 1:
        return wav_list[0]

    all_frames = bytearray()
    channels = 1
    sampwidth = 2
    framerate = rate

    silence_frames = int(framerate * (silence_ms / 1000.0))

    for i, w_bytes in enumerate(wav_list):
        if not w_bytes:
            continue
        try:
            with wave.open(io.BytesIO(w_bytes), "rb") as wf:
                channels = wf.getnchannels()
                sampwidth = wf.getsampwidth()
                framerate = wf.getframerate()
                frames = wf.readframes(wf.getnframes())
                if i > 0 and all_frames:
                    silence_bytes = b"\x00" * (silence_frames * channels * sampwidth)
                    all_frames.extend(silence_bytes)
                all_frames.extend(frames)
        except Exception:
            # Fallback if unformatted test mock bytes
            if i > 0 and all_frames:
                all_frames.extend(b"\x00" * (silence_frames * 2))
            all_frames.extend(w_bytes)

    out_buf = io.BytesIO()
    with wave.open(out_buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sampwidth)
        wf.setframerate(framerate)
        wf.writeframes(all_frames)
    return out_buf.getvalue()


_SYNTH_SLOTS = threading.Semaphore(12)
_SEGMENT_WORKERS = 8


def neutralise_markup(text: str) -> str:
    """Gemini TTS reads [bracketed] words as style tags such as [whispering]. Document text must
    never steer the voice, so square brackets are turned into spaces."""
    if not text or ("[" not in text and "]" not in text):
        return text
    return re.sub(r"[ \t]+", " ", re.sub(r"[\[\]]", " ", text)).strip()


def split_to_byte_limit(text: str, max_bytes: int = _MAX_TEXT_BYTES) -> List[str]:
    """Splits one long sentence into parts that each fit the Gemini TTS text limit (UTF-8 bytes),
    cutting at a space or punctuation mark when one is available."""
    rest = (text or "").strip()
    parts: List[str] = []
    while rest:
        if len(rest.encode("utf-8")) <= max_bytes:
            parts.append(rest)
            break
        used = 0
        cut = len(rest)
        for index, char in enumerate(rest):
            used += len(char.encode("utf-8"))
            if used > max_bytes:
                cut = index
                break
        window = rest[:cut]
        best = max(window.rfind(mark) for mark in (" ", ",", ";", "،", "।", "\n"))
        if best >= cut // 2:
            cut = best + 1
        piece = rest[:cut].strip()
        if piece:
            parts.append(piece)
        rest = rest[cut:].strip()
    return parts


def ensure_wav(audio: bytes, rate: int = 24000) -> bytes:
    """Returns WAV bytes. If the service ever returns bare 16-bit mono PCM, add the header."""
    if not audio or audio[:4] == b"RIFF":
        return audio
    out = io.BytesIO()
    with wave.open(out, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(audio)
    return out.getvalue()


def synthesize_speech(
    text: str,
    lang: str = "en",
    voice_gender: str = "female",
    rate: float = 1.0,
    client: Optional[Any] = None,
    voice_index: Optional[int] = None,
) -> bytes:
    """
    Synthesizes speech with Gemini TTS through Google Cloud Text-to-Speech.
    Returns 24000Hz 16-bit PCM WAV audio bytes.

    - One voice is chosen per call from the gender's rotating pool (voice_index picks it, random
      when absent) and used for every sentence, so the voice never changes mid-read.
    - A natural-language style prompt (warm, calm, tone follows the meaning) is sent in the
      prompt field. It is not spoken.
    - Sentences are synthesized in parallel and stitched with 250ms silence.
    - rate only shapes the style prompt. The apps change playback speed on the player.
    - There is no fallback voice. If Gemini TTS fails the error is raised to the caller.
    """
    from google.cloud import texttospeech

    if not text or not text.strip():
        return b""

    norm_lang = (lang or "en").lower().split("-")[0]
    if norm_lang == "or" or (norm_lang != "auto" and norm_lang not in SPEAK_LANG_CODES):
        raise ValueError(f"Language not supported for speech synthesis: {norm_lang}")
    if norm_lang == "auto":
        norm_lang = "en"

    lang_code = SPEAK_LANG_CODES[norm_lang]
    voice_name = choose_voice(voice_gender, voice_index)
    model_name = gemini_tts_model()
    prompt = style_prompt(norm_lang, rate)

    normalized = normalize_caps_and_ids(neutralise_markup(text))
    sentences = split_sentences(normalized)
    if not sentences:
        sentences = [normalized]

    if client is None:
        client = texttospeech.TextToSpeechClient()

    voice_params = texttospeech.VoiceSelectionParams(
        language_code=lang_code,
        name=voice_name,
        model_name=model_name,
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.LINEAR16,
        sample_rate_hertz=24000,
    )

    def synth_part(part_text: str) -> bytes:
        synthesis_input = texttospeech.SynthesisInput(text=part_text, prompt=prompt)
        # One try, then at most one retry on 429.
        for attempt in range(2):
            try:
                with _SYNTH_SLOTS:
                    response = client.synthesize_speech(
                        input=synthesis_input,
                        voice=voice_params,
                        audio_config=audio_config,
                    )
                audio = response.audio_content
                if not audio:
                    raise RuntimeError("Gemini TTS returned no audio")
                return ensure_wav(audio)
            except Exception as exc:
                code = getattr(exc, "code", None)
                message = str(exc).lower()
                rate_limited = code == 429 or "429" in message or "resource exhausted" in message
                if rate_limited and attempt == 0:
                    time.sleep(0.05)
                    continue
                raise

    def synth_segment(seg_text: str) -> bytes:
        prep_text = to_speech(seg_text, norm_lang)
        if not prep_text.strip():
            return b""
        parts = split_to_byte_limit(prep_text)
        if len(parts) == 1:
            return synth_part(parts[0])
        return stitch_wavs([synth_part(p) for p in parts], silence_ms=120, rate=24000)

    started = time.perf_counter()
    try:
        if len(sentences) == 1:
            audio_out = synth_segment(sentences[0])
        else:
            with concurrent.futures.ThreadPoolExecutor(
                max_workers=min(_SEGMENT_WORKERS, len(sentences))
            ) as executor:
                segment_wavs = list(executor.map(synth_segment, sentences))
            valid_wavs = [w for w in segment_wavs if w]
            audio_out = stitch_wavs(valid_wavs, silence_ms=250, rate=24000)
    except Exception as exc:
        logger.warning(
            "tts_synth failed: model=%s voice=%s lang=%s segments=%d ms=%d error=%s",
            model_name, voice_name, lang_code, len(sentences),
            int((time.perf_counter() - started) * 1000), type(exc).__name__,
        )
        raise
    logger.info(
        "tts_synth ok: model=%s voice=%s lang=%s segments=%d chars=%d bytes=%d ms=%d",
        model_name, voice_name, lang_code, len(sentences), len(text), len(audio_out),
        int((time.perf_counter() - started) * 1000),
    )
    return audio_out

