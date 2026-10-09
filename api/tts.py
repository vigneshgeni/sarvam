import os
import re
from typing import Dict, Optional, Tuple

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

SPEAK_VOICES: Dict[str, Dict[str, str]] = {
    "ta": {
        "female": "ta-IN-Chirp3-HD-Achernar",
        "male": "ta-IN-Chirp3-HD-Achird",
    },
    "hi": {
        "female": "hi-IN-Chirp3-HD-Achernar",
        "male": "hi-IN-Chirp3-HD-Achird",
    },
    "te": {
        "female": "te-IN-Chirp3-HD-Achernar",
        "male": "te-IN-Chirp3-HD-Achird",
    },
    "ml": {
        "female": "ml-IN-Chirp3-HD-Achernar",
        "male": "ml-IN-Chirp3-HD-Achird",
    },
    "kn": {
        "female": "kn-IN-Chirp3-HD-Achernar",
        "male": "kn-IN-Chirp3-HD-Achird",
    },
    "en": {
        "female": "en-IN-Chirp3-HD-Achernar",
        "male": "en-IN-Chirp3-HD-Achird",
    },
}


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


def synthesize_speech(
    text: str,
    lang: str = "en",
    voice_gender: str = "female",
    rate: float = 1.0,
) -> bytes:
    """
    Synthesizes speech using Google Cloud Text-to-Speech Chirp 3 HD voices.
    Returns MP3 audio bytes.
    """
    from google.cloud import texttospeech

    norm_lang = (lang or "en").lower().split("-")[0]
    voice_info = SPEAK_VOICES.get(norm_lang, SPEAK_VOICES["en"])
    selected_voice_name = voice_info.get(voice_gender, voice_info["female"])

    # Language code for voice
    lang_code = f"{norm_lang}-IN"

    # Pre-process text with to_speech
    prepared_text = to_speech(text, norm_lang)

    client = texttospeech.TextToSpeechClient()

    synthesis_input = texttospeech.SynthesisInput(text=prepared_text)

    voice_params = texttospeech.VoiceSelectionParams(
        language_code=lang_code,
        name=selected_voice_name,
    )

    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3,
        speaking_rate=max(0.25, min(4.0, rate)),
    )

    response = client.synthesize_speech(
        input=synthesis_input,
        voice=voice_params,
        audio_config=audio_config,
    )

    return response.audio_content
