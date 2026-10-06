from typing import Optional
from fastapi.responses import JSONResponse

ERROR_MESSAGES = {
    "file_too_large": {
        "en": "Total file size exceeds 15 MB limit.",
        "ta": "மொத்த கோப்பு அளவு 15 MB வரம்பை விட அதிகமாக உள்ளது.",
        "hi": "कुल फ़ाइल आकार 15 MB सीमा से अधिक है.",
    },
    "no_files": {
        "en": "No files provided. Please upload 1 PDF or 1–3 images.",
        "ta": "கோப்புகள் எதுவும் வழங்கப்படவில்லை. 1 PDF அல்லது 1–3 படங்களை பதிவேற்றவும்.",
        "hi": "कोई फ़ाइल प्रदान नहीं की गई. कृपया 1 PDF या 1–3 छवियां अपलोड करें.",
    },
    "invalid_file_type": {
        "en": "Invalid file type. Please upload 1 PDF or 1–3 JPG/PNG images.",
        "ta": "தவறான கோப்பு வகை. 1 PDF அல்லது 1–3 JPG/PNG படங்களை பதிவேற்றவும்.",
        "hi": "अमान्य फ़ाइल प्रकार. कृपया 1 PDF या 1–3 JPG/PNG छवियां अपलोड करें.",
    },
    "docx_file": {
        "en": "Word files are not supported yet — save as PDF and try again.",
        "ta": "Word கோப்புகள் இன்னும் ஆதரிக்கப்படவில்லை — PDF ஆக சேமித்து மீண்டும் முயற்சிக்கவும்.",
        "hi": "Word फ़ाइलें अभी समर्थित नहीं हैं — PDF के रूप में सहेजें और पुनः प्रयास करें.",
    },
    "too_many_images": {
        "en": "Please upload at most 3 images.",
        "ta": "அதிகபட்சம் 3 படங்களை மட்டுமே பதிவேற்றவும்.",
        "hi": "कृपया अधिकतम 3 छवियां अपलोड करें.",
    },
    "mixed_files": {
        "en": "Cannot mix PDF and image files. Please upload 1 PDF or 1–3 images.",
        "ta": "PDF மற்றும் படங்களை ஒன்றாக பதிவேற்ற முடியாது. 1 PDF அல்லது 1–3 படங்களை பதிவேற்றவும்.",
        "hi": "PDF और छवि फ़ाइलों को मिश्रित नहीं किया जा सकता. कृपया 1 PDF या 1–3 छवियां अपलोड करें.",
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
    "rate_limit": {
        "en": "Too many requests. Limit is 10 requests per minute.",
        "ta": "அதிகப்படியான கோரிக்கைகள். நிமிடத்திற்கு 10 கோரிக்கைகள் மட்டுமே அனுமதிக்கப்படும்.",
        "hi": "बहुत अधिक अनुरोध. सीमा प्रति मिनट 10 अनुरोध है.",
    },
}


def make_error_response(
    status_code: int,
    error_key: str,
    lang: str = "en",
    custom_message: Optional[str] = None,
) -> JSONResponse:
    lang_code = lang.strip().lower().split("-")[0] if lang else "en"
    translations = ERROR_MESSAGES.get(error_key, {})

    msg_en = custom_message or translations.get("en", "An error occurred.")
    msg_local = translations.get(lang_code, msg_en)

    return JSONResponse(
        status_code=status_code,
        content={
            "message": msg_en,
            "message_local": msg_local,
        },
    )
