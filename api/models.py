from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, model_validator

DOCUMENT_TYPES = (
    "utility_bill",
    "telecom_bill",
    "tax_receipt",
    "insurance",
    "bank",
    "government_notice",
    "court_legal",
    "challan",
    "medical",
    "receipt",
    "agreement",
    "corporate",
    "other",
)

DocumentType = Literal[
    "utility_bill",
    "telecom_bill",
    "tax_receipt",
    "insurance",
    "bank",
    "government_notice",
    "court_legal",
    "challan",
    "medical",
    "receipt",
    "agreement",
    "corporate",
    "other",
]


# Models used for Gemini Reader Prompt response schema (without evidence, date_status, evidence_summary)
class ReaderAction(BaseModel):
    text: str = Field(description="Action description in the requested language")
    due_date: Optional[str] = Field(
        default=None,
        description="Due date in YYYY-MM-DD format if printed, else null",
    )
    deadline_rule: Optional[str] = Field(
        default=None,
        description="Relative deadline rule display text in the requested language, e.g. 'within 30 days of this letter', else null",
    )
    deadline_days: Optional[int] = Field(
        default=None,
        description="Number of days for relative deadline (e.g. 30), else null",
    )
    deadline_anchor: Optional[str] = Field(
        default=None,
        description="'letter_date' if relative deadline is measured from letter_date, else null",
    )
    recurrence: Optional[str] = Field(
        default=None,
        description="Display text for recurring schedule rule (e.g. '31st of every month'), else null",
    )
    quote: str = Field(
        description="Exact verbatim source text from the document in original language"
    )
    page: int = Field(
        default=1,
        description="Page number where the quote is located",
    )


class ReaderWarning(BaseModel):
    text: str = Field(description="Warning description in the requested language")
    quote: str = Field(
        description="Exact verbatim source text from the document in original language"
    )
    page: int = Field(
        default=1,
        description="Page number where the quote is located",
    )


class ReaderFact(BaseModel):
    text: str = Field(description="Fact description in the requested language")
    quote: str = Field(
        description="Exact verbatim source text from the document in original language"
    )
    page: int = Field(
        default=1,
        description="Page number where the quote is located",
    )


class ReaderGlanceKeyValue(BaseModel):
    label: str = Field(description="Label for this key value, e.g. Due Date, Amount Due, Account No.")
    value: str = Field(description="Value copied verbatim from document")
    kind: str = Field(default="text", description="kind: amount | date | text")


class ReaderGlance(BaseModel):
    headline: str = Field(description="Short headline in 12 words or fewer")
    key_values: List[ReaderGlanceKeyValue] = Field(
        default_factory=list,
        description="Max 3 key-value pairs (amounts, dates, reference numbers)",
    )


class ReaderPlace(BaseModel):
    label: str = Field(description="Place / address label, e.g. Hospital Address, Court Location")
    address: str = Field(description="Full address copied verbatim")
    quote: str = Field(description="Verbatim quote containing this address")
    page: int = Field(default=1, description="Page number")


class ReaderContact(BaseModel):
    label: str = Field(description="Contact label, e.g. Helpline, Grievance Officer, Customer Care")
    value: str = Field(description="Phone number or email address copied verbatim")
    quote: str = Field(description="Verbatim quote containing this contact")
    page: int = Field(default=1, description="Page number")


class ReaderResponse(BaseModel):
    doc_type: str = Field(
        default="other",
        description="Document type: utility_bill, telecom_bill, tax_receipt, insurance, bank, government_notice, court_legal, challan, medical, receipt, agreement, corporate, other",
    )
    document_type: str = Field(
        default="other",
        description="Document type: utility_bill, telecom_bill, tax_receipt, insurance, bank, government_notice, court_legal, challan, medical, receipt, agreement, corporate, other",
    )
    document_language: Optional[str] = Field(
        default=None,
        description="Primary language code of document (e.g. en, ta, hi, kn, te, ml, mr, bn, gu, pa, or, ur)",
    )
    title: str = Field(description="Document title in the requested language")
    report_title: Optional[str] = Field(
        default=None,
        description="Display title printed on the report or notice, or null if not clearly printed. Never invent.",
    )
    report_date: Optional[str] = Field(
        default=None,
        description="Date printed on the report or notice in display text, or null if not clearly printed. Never invent.",
    )
    language: str = Field(description="Language code actually written, e.g. ta, hi, en")
    letter_date: Optional[str] = Field(
        default=None,
        description="Date of the notice or letter in YYYY-MM-DD if printed, else null",
    )
    glance: Optional[ReaderGlance] = Field(
        default=None,
        description="Headline (<=12 words) and up to 3 key-value pairs",
    )
    summary: List[str] = Field(
        description="2-4 sentence explanation in the requested language"
    )
    actions: List[ReaderAction] = Field(
        default_factory=list,
        description="Actions required, most important first",
    )
    warnings: List[ReaderWarning] = Field(
        default_factory=list,
        description="Only warnings stated in the document itself",
    )
    facts: List[ReaderFact] = Field(
        default_factory=list,
        description="Key facts (amounts, IDs, dates, names) from the document",
    )
    places: List[ReaderPlace] = Field(
        default_factory=list,
        description="Max 5 addresses or places printed in the document",
    )
    contacts: List[ReaderContact] = Field(
        default_factory=list,
        description="Max 6 contact phone numbers or email addresses printed in the document",
    )
    conflicts: List[str] = Field(
        default_factory=list,
        description="Contradictory dates or amounts if present in the document",
    )
    unreadable: bool = Field(
        default=False,
        description="True if document or page is blurry, cut off or unreadable",
    )
    unreadable_reason: Optional[str] = Field(
        default=None,
        description="Reason why the document is unreadable, else null",
    )
    protected_terms: List[str] = Field(
        default_factory=list,
        description="Person names (with title), organisation/hospital/lab/company names, street addresses, place names, ID/policy/claim/account/reference numbers, phone numbers, email and web addresses copied exactly as printed in original script. Never generic office or department terms.",
    )

    @model_validator(mode="before")
    @classmethod
    def sync_reader_doc_types(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "document_type" in data and ("doc_type" not in data or not data.get("doc_type")):
                data["doc_type"] = data["document_type"]
            elif "doc_type" in data and ("document_type" not in data or not data.get("document_type")):
                data["document_type"] = data["doc_type"]
        return data


# Final API Response Models (Section 6 contract with evidence, date_status, and evidence_summary)
class EvidenceSummary(BaseModel):
    matched: int = 0
    check_original: int = 0
    calculated: int = 0


class ExplainAction(BaseModel):
    text: str
    due_date: Optional[str] = None
    deadline_rule: Optional[str] = None
    deadline_days: Optional[int] = None
    deadline_anchor: Optional[str] = None
    recurrence: Optional[str] = None
    date_status: str = "none"  # upcoming | passed | calculated | recurring | none
    quote: str
    page: int = 1
    evidence: str = "check_original"  # matched | check_original | calculated


class ExplainWarning(BaseModel):
    text: str
    quote: str
    page: int = 1
    evidence: str = "check_original"  # matched | check_original


class ExplainFact(BaseModel):
    text: str
    quote: str
    page: int = 1
    evidence: str = "check_original"  # matched | check_original


class GlanceKeyValue(BaseModel):
    label: str
    value: str
    kind: str = "text"  # amount | date | text
    evidence: str = "check_original"  # matched | check_original | calculated


class GlanceSummary(BaseModel):
    headline: str  # <= 12 words
    key_values: List[GlanceKeyValue] = Field(default_factory=list)  # max 3


class PlaceInfo(BaseModel):
    label: str
    address: str
    quote: str
    page: int = 1
    evidence: str = "check_original"  # matched | check_original


class ContactInfo(BaseModel):
    label: str
    value: str  # phone or email
    quote: str
    page: int = 1
    evidence: str = "check_original"  # matched | check_original


class ExplainResponse(BaseModel):
    doc_type: str = "other"
    document_type: str = "other"
    document_language: Optional[str] = None
    title: str
    report_title: Optional[str] = None
    report_date: Optional[str] = None
    report_date_iso: Optional[str] = None
    language: str
    letter_date: Optional[str] = None
    source_kind: str = "photo"  # text_pdf | scanned_pdf | photo
    glance: Optional[GlanceSummary] = None
    summary: List[str]
    actions: List[ExplainAction] = Field(default_factory=list)
    warnings: List[ExplainWarning] = Field(default_factory=list)
    facts: List[ExplainFact] = Field(default_factory=list)
    places: List[PlaceInfo] = Field(default_factory=list)
    contacts: List[ContactInfo] = Field(default_factory=list)
    conflicts: List[str] = Field(default_factory=list)
    evidence_summary: EvidenceSummary = Field(default_factory=EvidenceSummary)
    unreadable: bool = False
    unreadable_reason: Optional[str] = None
    protected_terms: List[str] = Field(
        default_factory=list,
        description="Person names (with title), organisation/hospital/lab/company names, street addresses, place names, ID/policy/claim/account/reference numbers, phone numbers, email and web addresses copied exactly as printed in original script. Never generic office or department terms.",
    )

    @model_validator(mode="before")
    @classmethod
    def sync_explain_doc_types(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "document_type" in data and ("doc_type" not in data or not data.get("doc_type")):
                data["doc_type"] = data["document_type"]
            elif "doc_type" in data and ("document_type" not in data or not data.get("document_type")):
                data["document_type"] = data["doc_type"]
        return data


class ErrorResponse(BaseModel):
    message: str
    message_local: str


# Translation Models
class TranslateActionText(BaseModel):
    text: str = Field(description="Translated action description in target language")
    deadline_rule: Optional[str] = Field(
        default=None,
        description="Translated relative deadline display text if present, else null",
    )
    recurrence: Optional[str] = Field(
        default=None,
        description="Translated recurrence display text if present, else null",
    )


class TranslateWarningText(BaseModel):
    text: str = Field(description="Translated warning description in target language")


class TranslateFactText(BaseModel):
    text: str = Field(description="Translated fact description in target language")


class TranslatePayload(BaseModel):
    title: str = Field(description="Translated title in target language")
    report_title: Optional[str] = Field(
        default=None,
        description="Translated report title if present in original, else null",
    )
    summary: List[str] = Field(
        description="Translated 2-4 sentence explanation in target language"
    )
    actions: List[TranslateActionText] = Field(
        default_factory=list,
        description="Translated actions in order",
    )
    warnings: List[TranslateWarningText] = Field(
        default_factory=list,
        description="Translated warnings in order",
    )
    facts: List[TranslateFactText] = Field(
        default_factory=list,
        description="Translated facts in order",
    )
    conflicts: List[str] = Field(
        default_factory=list,
        description="Translated conflicts if present",
    )
    unreadable_reason: Optional[str] = Field(
        default=None,
        description="Translated unreadable reason if present, else null",
    )
    protected_terms: List[str] = Field(
        default_factory=list,
        description="Protected terms copied verbatim in original script without translation or transliteration",
    )


# Keyed String Translation Model for Shrunk Translate Input (Item 2)
class KeyedTranslateResponse(BaseModel):
    strings: Dict[str, str] = Field(
        default_factory=dict,
        description="Translated text strings keyed by their exact id",
    )


class TranslateRequest(BaseModel):
    result: ExplainResponse
    lang: str
