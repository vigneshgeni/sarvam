from typing import Dict, Optional
from fastapi.responses import JSONResponse


class PDFPasswordRequiredError(Exception):
    pass


class PDFPasswordWrongError(Exception):
    pass


class AskUnverifiedError(Exception):
    pass

ERROR_MESSAGES = {
    "file_too_large": {
        "en": "Total file size exceeds 25 MB limit.",
        "ta": "மொத்த கோப்பு அளவு 25 MB வரம்பை விட அதிகமாக உள்ளது.",
        "hi": "कुल फ़ाइल आकार 25 MB सीमा से अधिक है.",
    },
    "pdf_too_large": {
        "en": "PDF file size exceeds 20 MB limit.",
        "ta": "PDF கோப்பு அளவு 20 MB வரம்பை விட அதிகமாக உள்ளது.",
        "hi": "PDF फ़ाइल का आकार 20 MB की सीमा से अधिक है.",
    },
    "no_files": {
        "en": "No files provided. Please upload 1 PDF or 1–10 images.",
        "ta": "கோப்புகள் எதுவும் வழங்கப்படவில்லை. 1 PDF அல்லது 1–10 படங்களை பதிவேற்றவும்.",
        "hi": "कोई फ़ाइल प्रदान नहीं की गई. कृपया 1 PDF या 1–10 छवियां अपलोड करें.",
    },
    "invalid_file_type": {
        "en": "Invalid file type. Please upload 1 PDF or 1–10 JPG/PNG images.",
        "ta": "தவறான கோப்பு வகை. 1 PDF அல்லது 1–10 JPG/PNG படங்களை பதிவேற்றவும்.",
        "hi": "अमान्य फ़ाइल प्रकार. कृपया 1 PDF या 1–10 JPG/PNG छवियां अपलोड करें.",
    },
    "docx_file": {
        "en": "Word files are not supported yet — save as PDF and try again.",
        "ta": "Word கோப்புகள் இன்னும் ஆதரிக்கப்படவில்லை — PDF ஆக சேமித்து மீண்டும் முயற்சிக்கவும்.",
        "hi": "Word फ़ाइलें अभी समर्थित नहीं हैं — PDF के रूप में सहेजें और पुनः प्रयास करें.",
    },
    "too_many_images": {
        "en": "Please upload at most 10 images.",
        "ta": "அதிகபட்சம் 10 படங்களை மட்டுமே பதிவேற்றவும்.",
        "hi": "कृपया अधिकतम 10 छवियां अपलोड करें.",
    },
    "mixed_files": {
        "en": "Cannot mix PDF and image files. Please upload 1 PDF or 1–10 images.",
        "ta": "PDF மற்றும் படங்களை ஒன்றாக பதிவேற்ற முடியாது. 1 PDF அல்லது 1–10 படங்களை பதிவேற்றவும்.",
        "hi": "PDF और छवि फ़ाइलों को मिश्रित नहीं किया जा सकता. कृपया 1 PDF या 1–10 छवियां अपलोड करें.",
    },
    "unreadable": {
        "en": "Document is unreadable or blurry. Please take a clearer photo and try again.",
        "ta": "ஆவணம் மங்கலாக அல்லது படிக்க முடியாததாக உள்ளது. தெளிவான படம் எடுத்து மீண்டும் முயற்சிக்கவும்.",
        "hi": "दस्तावेज़ अस्पष्ट या पढ़ने योग्य नहीं है. कृपया स्पष्ट फ़ोटो लें और पुनः प्रयास करें.",
    },
    "gemini_busy": {
        "en": "Service is busy. Please try again shortly.",
        "ta": "சேவை தற்போது பிஸியாக உள்ளது. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.",
        "hi": "सेवा व्यस्त है. कृपया थोड़ी देर बाद पुनः प्रयास करें.",
    },
    "service_busy": {
        "en": "Service is busy. Please try again shortly.",
        "ta": "சேவை தற்போது பிஸியாக உள்ளது. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.",
        "hi": "सेवा व्यस्त है. कृपया थोड़ी देर बाद पुनः प्रयास करें.",
    },
    "upstream_error": {
        "en": "Service is busy. Please try again shortly.",
        "ta": "சேவை தற்போது பிஸியாக உள்ளது. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.",
        "hi": "सेवा व्यस्त है. कृपया थोड़ी देर बाद पुनः प्रयास करें.",
    },
    "timeout": {
        "en": "Request timed out. Please try again.",
        "ta": "கோரிக்கைக்கான நேரம் முடிந்துவிட்டது. மீண்டும் முயற்சிக்கவும்.",
        "hi": "अनुरोध का समय समाप्त हो गया. कृपया पुन: प्रयास करें.",
    },
    "rate_limit": {
        "en": "Too many requests. Please try again later.",
        "ta": "அதிகப்படியான கோரிக்கைகள். சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.",
        "hi": "बहुत अधिक अनुरोध. कृपया बाद में पुनः प्रयास करें.",
    },
    "translation_guard_failed": {
        "en": "Translation verification failed. Please try again.",
        "ta": "மொழிபெயர்ப்பு சரிபார்ப்பு தோல்வியடைந்தது. மீண்டும் முயற்சிக்கவும்.",
        "hi": "अनुवाद सत्यापन विफल रहा. कृपया पुनः प्रयास करें.",
        "te": "అనువాద ధృవీకరణ విఫలమైంది. దయచేసి మళ్లీ ప్రయత్నించండి.",
        "ml": "വിവർത്തന സ്ഥിരീകരണം പരാജയപ്പെട്ടു. ദയവായി വീണ്ടും ശ്രമിക്കുക.",
        "kn": "ಅನುವಾದ ಪರಿಶೀಲನೆ ವಿಫಲವಾಗಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    },
    "pdf_password_required": {
        "en": "Password required to open this PDF.",
        "ta": "இந்த PDF-ஐ திறக்க கடவுச்சொல் தேவை.",
        "hi": "इस PDF को खोलने के लिए पासवर्ड आवश्यक है.",
        "te": "ఈ PDF తెరవడానికి పాస్‌వర్డ్ అవసరం.",
        "ml": "ഈ PDF തുറക്കാൻ പാസ്‌വേഡ് ആവശ്യമാണ്.",
        "kn": "ಈ PDF ತೆರೆಯಲು ಪಾಸ್‌ವರ್ಡ್ ಅಗತ್ಯವಿದೆ.",
    },
    "pdf_password_wrong": {
        "en": "Incorrect password for this PDF.",
        "ta": "தவறான கடவுச்சொல்.",
        "hi": "गलत पासवर्ड.",
        "te": "తప్పు పాస్‌వర్డ్.",
        "ml": "തെറ്റായ പാസ്‌വേഡ്.",
        "kn": "ತಪ್ಪು ಪಾಸ್‌ವರ್ಡ್.",
    },
    "ask_unverified": {
        "en": "Answer could not be verified against the document.",
        "ta": "பதிலை ஆவணத்துடன் சரிபார்க்க முடியவில்லை.",
        "hi": "उत्तर को दस्तावेज़ से सत्यापित नहीं किया जा सका.",
        "te": "సమాధానాన్ని పత్రంతో ధృవీకరించడం సాధ్యం కాలేదు.",
        "ml": "ഉത്തരം രേഖയുമായി സ്ഥിരീകരിക്കാൻ കഴിഞ്ഞില്ല.",
        "kn": "ಉತ್ತರವನ್ನು ದಾಖಲೆಯೊಂದಿಗೆ ಪರಿಶೀಲಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.",
    },
    "text_too_long": {
        "en": "Text exceeds 1200 characters limit.",
        "ta": "உரை 1200 எழுத்துக்கள் வரம்பை மீறுகிறது.",
        "hi": "पाठ 1200 वर्णों की सीमा से अधिक है.",
        "te": "వచనం 1200 అక్షరాల పరిమితిని మించిపోయింది.",
        "ml": "ടെക്‌സ്‌റ്റ് 1200 പ്രതീകങ്ങളുടെ പരിധി കവിയുന്നു.",
        "kn": "ಪಠ್ಯವು 1200 ಅಕ್ಷರಗಳ ಮಿತಿಯನ್ನು ಮೀರಿದೆ.",
    },
    "tts_unavailable": {
        "en": "Text-to-speech service is currently unavailable.",
        "ta": "உரையிலிருந்து பேச்சு சேவை தற்போது கிடைக்கவில்லை.",
        "hi": "टेक्स्ट-टू-स्पीच सेवा वर्तमान में अनुपलब्ध है.",
        "te": "టెక్స్ట్-టు-స్పీచ్ సేవ ప్రస్తుతం అందుబాటులో లేదు.",
        "ml": "ടെക്സ്റ്റ്-ടു-സ്പീച്ച് സേവനം നിലവിൽ ലഭ്യമല്ല.",
        "kn": "ಪಠ್ಯದಿಂದ ಧ್ವನಿ ಸೇವೆ ಪ್ರಸ್ತುತ ಲಭ್ಯವಿಲ್ಲ.",
    },
}


def make_error_response(
    status_code: int,
    error_key: str,
    lang: str = "en",
    custom_message: Optional[str] = None,
    headers: Optional[Dict[str, str]] = None,
    error_code: Optional[str] = None,
) -> JSONResponse:
    lang_code = lang.strip().lower().split("-")[0] if lang else "en"
    if lang_code == "auto":
        lang_code = "en"
    translations = ERROR_MESSAGES.get(error_key, {})

    msg_en = custom_message or translations.get("en", "An error occurred.")
    msg_local = translations.get(lang_code, msg_en)

    code = error_code or (
        error_key if error_key in (
            "pdf_password_required",
            "pdf_password_wrong",
            "ask_unverified",
            "text_too_long",
            "tts_unavailable",
        ) else None
    )

    content = {
        "message": msg_en,
        "message_local": msg_local,
    }
    if code:
        content["error"] = code

    return JSONResponse(
        status_code=status_code,
        content=content,
        headers=headers,
    )
