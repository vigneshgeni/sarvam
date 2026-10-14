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

DOCUMENT_KINDS = (
    "government_notice",
    "pension_notice",
    "tax_notice",
    "challan",
    "court_legal",
    "utility_bill",
    "telecom_bill",
    "invoice",
    "receipt",
    "insurance",
    "lab_report",
    "prescription",
    "discharge_summary",
    "hospital_bill",
    "investment",
    "bank_statement",
    "loan",
    "agreement",
    "form",
    "salary_slip",
    "school",
    "corporate",
    "other",
)

DocumentKind = Literal[
    "government_notice",
    "pension_notice",
    "tax_notice",
    "challan",
    "court_legal",
    "utility_bill",
    "telecom_bill",
    "invoice",
    "receipt",
    "insurance",
    "lab_report",
    "prescription",
    "discharge_summary",
    "hospital_bill",
    "investment",
    "bank_statement",
    "loan",
    "agreement",
    "form",
    "salary_slip",
    "school",
    "corporate",
    "other",
]

KIND_TO_DOCUMENT_TYPE = {
    "government_notice": "government_notice",
    "pension_notice": "government_notice",
    "tax_notice": "tax_receipt",
    "challan": "challan",
    "court_legal": "court_legal",
    "utility_bill": "utility_bill",
    "telecom_bill": "telecom_bill",
    "invoice": "receipt",
    "receipt": "receipt",
    "insurance": "insurance",
    "lab_report": "medical",
    "prescription": "medical",
    "discharge_summary": "medical",
    "hospital_bill": "medical",
    "investment": "bank",
    "bank_statement": "bank",
    "loan": "bank",
    "agreement": "agreement",
    "form": "other",
    "salary_slip": "bank",
    "school": "other",
    "corporate": "corporate",
    "other": "other",
}


def coarse_type_for_kind(kind: Optional[str]) -> Optional[str]:
    if not kind:
        return None
    return KIND_TO_DOCUMENT_TYPE.get(kind)


class QuotedField(BaseModel):
    label: str = ""
    value: str = ""
    quote: str = ""
    page: int = 1


class LineItem(BaseModel):
    description: str = ""
    qty: Optional[str] = None
    amount: Optional[str] = None
    quote: str = ""
    page: int = 1


class Party(BaseModel):
    role: str = ""
    name: str = ""


class FormFieldItem(BaseModel):
    name: str = ""
    instruction: str = ""
    quote: str = ""
    page: int = 1


class DocumentProfile(BaseModel):
    """Kind-specific fields. Empty means the page did not print that fact.

    Fields are plain values, not null, so the reader schema stays small enough
    for Vertex. The web treats an empty string or a zero EMI day as absent.
    """

    lab_name: str = ""
    patient_age_sex: str = ""
    sample_date: str = ""
    referred_by: str = ""
    follow_up: str = ""
    diagnosis_as_written: str = ""
    advice_lines: List[str] = Field(default_factory=list)
    amounts: List[QuotedField] = Field(default_factory=list)
    due_date: str = ""
    last_date_without_penalty: str = ""
    how_to_pay: List[str] = Field(default_factory=list)
    seller: str = ""
    invoice_no: str = ""
    invoice_date: str = ""
    line_items: List[LineItem] = Field(default_factory=list)
    taxable_value: str = ""
    taxes: List[QuotedField] = Field(default_factory=list)
    total: str = ""
    paid_or_due: str = ""
    warranty_until: str = ""
    return_window: str = ""
    claimed: str = ""
    approved: str = ""
    deducted: str = ""
    deduction_reasons: List[str] = Field(default_factory=list)
    policy_no: str = ""
    sum_insured: str = ""
    premium: str = ""
    renewal_date: str = ""
    review_window: str = ""
    invested: str = ""
    current_value: str = ""
    gain: str = ""
    gain_calculated: bool = False
    units: str = ""
    nav: str = ""
    nav_date: str = ""
    folio: str = ""
    next_sip_date: str = ""
    opening: str = ""
    closing: str = ""
    credits_total: str = ""
    debits_total: str = ""
    gross: str = ""
    deductions: str = ""
    net_pay: str = ""
    period: str = ""
    lender: str = ""
    loan_type: str = ""
    loan_account: str = ""
    sanctioned_amount: str = ""
    interest_rate: str = ""
    tenure: str = ""
    emi_amount: str = ""
    emi_day_of_month: int = 0
    first_emi_date: str = ""
    next_emi_date: str = ""
    outstanding: str = ""
    charges: List[QuotedField] = Field(default_factory=list)
    agreement_type: str = ""
    parties: List[Party] = Field(default_factory=list)
    subject: str = ""
    start_date: str = ""
    end_date: str = ""
    term: str = ""
    rent_or_price: str = ""
    deposit: str = ""
    lock_in: str = ""
    notice_period: str = ""
    renewal_or_escalation: str = ""
    penalties: List[str] = Field(default_factory=list)
    case_or_notice_no: str = ""
    hearing_or_deadline: str = ""
    directions: List[str] = Field(default_factory=list)
    consequence: str = ""
    form_fields: List[FormFieldItem] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def blank_missing(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        for key, value in list(data.items()):
            if value is not None:
                continue
            field = cls.model_fields.get(key)
            if field is None:
                continue
            origin = getattr(field.annotation, "__origin__", None)
            if field.annotation is int:
                data[key] = 0
            elif field.annotation is bool:
                data[key] = False
            elif origin is list:
                data[key] = []
            else:
                data[key] = ""
        return data


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
    part_id: Optional[str] = Field(
        default=None,
        description="Part ID if from a multi-document upload, else null",
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
    part_id: Optional[str] = Field(
        default=None,
        description="Part ID if from a multi-document upload, else null",
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
    is_personal: bool = Field(
        default=False,
        description="True if this fact contains an identifier, reference or ID number, or personal name",
    )
    part_id: Optional[str] = Field(
        default=None,
        description="Part ID if from a multi-document upload, else null",
    )


class ReaderGlanceKeyValue(BaseModel):
    label: str = Field(description="Label for this key value, e.g. Due Date, Amount Due, Account No.")
    value: str = Field(description="Value copied verbatim from document")
    kind: str = Field(default="text", description="kind: amount | date | text")


class ReaderGlance(BaseModel):
    headline: str = Field(description="Short headline in 12 words or fewer")
    key_values: List[ReaderGlanceKeyValue] = Field(
        default_factory=list,
        description="Up to 6 key-value pairs. kind amount is only for money.",
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


class ReaderMedicine(BaseModel):
    name: str = Field(description="Medicine name as printed in document")
    strength_text: Optional[str] = Field(default=None, description="Dosage/strength as printed (e.g. 500mg, 5ml), else null")
    frequency_raw: str = Field(description="Raw frequency exactly as written, e.g. 1-0-1, BD, TDS, twice daily, SOS")
    food_timing: Optional[str] = Field(default=None, description="before_food | after_food | null")
    duration_days: Optional[int] = Field(default=None, description="Duration in days if stated, else null")
    instruction_text: str = Field(default="", description="Simple instruction in requested language")
    quote: str = Field(default="", description="Exact quote from document")
    page: int = Field(default=1, description="Page number where quote appears")


class ReaderSectionValue(BaseModel):
    label: str = Field(description="Test or item name, e.g. Fasting blood sugar, Total cholesterol")
    value: str = Field(description="Value printed, e.g. 118, 212")
    unit: Optional[str] = Field(default=None, description="Unit printed, e.g. mg/dL, %")
    ref_range: Optional[str] = Field(default=None, description="Reference range printed, e.g. 70 – 100")
    flag_printed: Optional[str] = Field(
        default=None,
        description="'High' | 'Low' only when document prints High/Low or H/L or arrows, else null. Never invent.",
    )
    quote: str = Field(default="", description="Verbatim quote only when flag_printed is High or Low. Empty otherwise.")
    page: int = Field(default=0, description="Original page of a High or Low row. 0 when the row has no quote.")


class ReaderSection(BaseModel):
    heading: str = Field(description="Section heading exactly as printed, in page order, e.g. Blood sugar, Lipid profile")
    page: int = Field(default=1, description="Page number where this section appears")
    values: List[ReaderSectionValue] = Field(default_factory=list)


class ReaderPart(BaseModel):
    part_id: str = Field(description="Unique part identifier, e.g. part-1, part-2")
    title: str = Field(description="Document title for this part, e.g. Lab Report, Prescription, Bill")
    document_type: str = Field(description="Coarse document type derived from document_kind")
    document_kind: Optional[str] = Field(default=None, description="Specific kind: lab_report, prescription, loan, invoice, and the other kinds")
    profile: Optional[DocumentProfile] = None
    issuer: Optional[str] = Field(default=None, description="Issuer or clinic name printed on this part")
    date_iso: Optional[str] = Field(default=None, description="Date printed on this part in YYYY-MM-DD format if present, else null")
    pages: List[int] = Field(description="Start and end page [start, end] (1-indexed)")
    glance: Optional[ReaderGlance] = None
    sections: Optional[List[ReaderSection]] = None
    medicines: Optional[List[ReaderMedicine]] = None
    key_points: Optional[List[str]] = None
    summary_lines: Optional[List[str]] = None


class ReaderResponse(BaseModel):
    doc_type: str = Field(
        default="other",
        description="Document type: utility_bill, telecom_bill, tax_receipt, insurance, bank, government_notice, court_legal, challan, medical, receipt, agreement, corporate, other",
    )
    document_kind: Optional[str] = Field(
        default=None,
        description="Most specific kind. One of the 23 document kinds. Derive document_type from it.",
    )
    profile: Optional[DocumentProfile] = None
    document_type: str = Field(
        default="other",
        description="Coarse type derived from document_kind: utility_bill, telecom_bill, tax_receipt, insurance, bank, government_notice, court_legal, challan, medical, receipt, agreement, corporate, other",
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
        description="Headline (<=12 words) and up to 6 key-value pairs",
    )
    summary: List[str] = Field(
        description="2-4 sentence explanation in the requested language"
    )
    spoken_summary: Optional[str] = Field(
        default=None,
        description="Spoken summary for listener in 4-7 short sentences, ~90 words max",
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
    medicines: List[ReaderMedicine] = Field(
        default_factory=list,
        description="Prescribed medicines if medical document, max 12",
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
    protected_terms_rendered: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="For each protected term, the exact strings written for it in this output, including the original spelling and any other spelling or script.",
    )
    mask_fallback: bool = Field(
        default=False,
        description="True when a source person name has no verified rendering. Ignored by the model; set by the server.",
    )
    parts: Optional[List[ReaderPart]] = Field(
        default=None,
        description="Parts if upload contains 2+ distinct documents, else null",
    )
    sections: Optional[List[ReaderSection]] = Field(
        default=None,
        description="Every printed lab section, even when there are only a few rows",
    )

    @model_validator(mode="before")
    @classmethod
    def sync_reader_doc_types(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "document_type" in data and ("doc_type" not in data or not data.get("doc_type")):
                data["doc_type"] = data["document_type"]
            elif "doc_type" in data and ("document_type" not in data or not data.get("document_type")):
                data["document_type"] = data["doc_type"]
            coarse = coarse_type_for_kind(data.get("document_kind"))
            if coarse:
                data["document_type"] = coarse
                data["doc_type"] = coarse
        return data


class GeminiReaderResponse(ReaderResponse):
    """Vertex schema. The profile object is on each part, not also on the root.

    Vertex rejects a response schema that contains DocumentProfile in both places.
    """

    profile: str = ""


def lift_reader_result(raw: GeminiReaderResponse) -> ReaderResponse:
    """Turn the Vertex shape into the API shape. One part is a single document."""
    data = raw.model_dump()
    parts = data.get("parts") or []
    if len(parts) == 1:
        part = parts[0] or {}
        data["profile"] = part.get("profile") or {}
        if not data.get("sections") and part.get("sections"):
            data["sections"] = part["sections"]
        if not data.get("medicines") and part.get("medicines"):
            data["medicines"] = part["medicines"]
        if not data.get("document_kind"):
            data["document_kind"] = part.get("document_kind")
        if not data.get("glance") and part.get("glance"):
            data["glance"] = part["glance"]
        data["parts"] = None
    elif len(parts) > 1:
        data["profile"] = None
    else:
        data["profile"] = None
    return ReaderResponse.model_validate(data)


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
    part_id: Optional[str] = None


class ExplainWarning(BaseModel):
    text: str
    quote: str
    page: int = 1
    evidence: str = "check_original"  # matched | check_original
    part_id: Optional[str] = None


class ExplainFact(BaseModel):
    text: str
    quote: str
    page: int = 1
    evidence: str = "check_original"  # matched | check_original
    is_personal: bool = False
    part_id: Optional[str] = None


class GlanceKeyValue(BaseModel):
    label: str
    value: str
    kind: str = "text"  # amount | date | text
    evidence: str = "check_original"  # matched | check_original | calculated


class GlanceSummary(BaseModel):
    headline: str  # <= 12 words
    key_values: List[GlanceKeyValue] = Field(default_factory=list)  # max 6


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


class MedicineInfo(BaseModel):
    name: str
    strength_text: Optional[str] = None
    frequency_raw: str
    frequency_code: str
    slots: List[str] = Field(default_factory=list)  # morning | afternoon | evening | night | bedtime | as_needed
    food_timing: Optional[str] = None  # before_food | after_food | null
    duration_days: Optional[int] = None
    instruction_text: str
    decoded: bool = True
    as_needed: bool = False
    quote: str = ""
    page: int = 1
    evidence: str = "check_original"  # matched | check_original | calculated


class ExplainSectionValue(BaseModel):
    label: str
    value: str
    unit: Optional[str] = None
    ref_range: Optional[str] = None
    flag_printed: Optional[str] = None  # 'High' | 'Low' | None
    quote: str = ""
    page: int = 0
    evidence: str = "check_original"


class ExplainSection(BaseModel):
    heading: str
    page: int = 1
    values: List[ExplainSectionValue] = Field(default_factory=list)


class ExplainPart(BaseModel):
    part_id: str
    title: str
    document_type: str
    document_kind: Optional[str] = None
    profile: Optional[DocumentProfile] = None
    issuer: Optional[str] = None
    date_iso: Optional[str] = None
    pages: List[int]  # [start, end]
    glance: Optional[GlanceSummary] = None
    sections: Optional[List[ExplainSection]] = None
    medicines: Optional[List[MedicineInfo]] = None
    key_points: Optional[List[str]] = None
    summary_lines: Optional[List[str]] = None


class ExplainResponse(BaseModel):
    doc_type: str = "other"
    document_type: str = "other"
    document_kind: Optional[str] = None
    profile: Optional[DocumentProfile] = None
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
    spoken_summary: Optional[str] = None
    actions: List[ExplainAction] = Field(default_factory=list)
    warnings: List[ExplainWarning] = Field(default_factory=list)
    facts: List[ExplainFact] = Field(default_factory=list)
    places: List[PlaceInfo] = Field(default_factory=list)
    contacts: List[ContactInfo] = Field(default_factory=list)
    medicines: List[MedicineInfo] = Field(default_factory=list)
    conflicts: List[str] = Field(default_factory=list)
    parts: Optional[List[ExplainPart]] = None
    sections: Optional[List[ExplainSection]] = None
    evidence_summary: EvidenceSummary = Field(default_factory=EvidenceSummary)
    unreadable: bool = False
    unreadable_reason: Optional[str] = None
    source_text: Optional[str] = Field(
        default=None,
        description="Verbatim extracted or recognized document text for grounding Ask questions",
    )
    protected_terms: List[str] = Field(
        default_factory=list,
        description="Person names (with title), organisation/hospital/lab/company names, street addresses, place names, ID/policy/claim/account/reference numbers, phone numbers, email and web addresses copied exactly as printed in original script. Never generic office or department terms.",
    )
    protected_terms_rendered: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="For each protected term, the exact strings written for it in this output, including the original spelling and any other spelling or script.",
    )
    mask_fallback: bool = Field(
        default=False,
        description="True when a source person name has no verified rendering. Share then keeps only actions, dates and amounts.",
    )

    @model_validator(mode="before")
    @classmethod
    def sync_explain_doc_types(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "document_type" in data and ("doc_type" not in data or not data.get("doc_type")):
                data["doc_type"] = data["document_type"]
            elif "doc_type" in data and ("document_type" not in data or not data.get("document_type")):
                data["document_type"] = data["doc_type"]
            coarse = coarse_type_for_kind(data.get("document_kind"))
            if coarse:
                data["document_type"] = coarse
                data["doc_type"] = coarse
        return data


class ErrorResponse(BaseModel):
    error: Optional[str] = None
    message: str
    message_local: str


class AskResponse(BaseModel):
    answer: str
    quote: Optional[str] = None
    page: Optional[int] = None
    evidence: str = "none"  # matched | check_original | none
    answered_from: str = "document"  # document | summary
    not_found: bool = False
    language: str


class SpeakRequest(BaseModel):
    text: str
    lang: str
    voice: Literal["female", "male"] = "female"
    rate: Optional[float] = Field(default=1.0, ge=0.25, le=4.0)


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
    protected_terms_rendered: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="For each protected term, the exact strings written in the translation, original spelling and any other spelling.",
    )
    mask_fallback: bool = Field(
        default=False,
        description="True when a source person name has no verified rendering.",
    )


# Keyed String Translation Model for Shrunk Translate Input (Item 2)
class NameRenderingFill(BaseModel):
    """Short reply listing the exact strings already written for each source name."""

    renderings: Dict[str, List[str]] = Field(default_factory=dict)


class KeyedTranslateResponse(BaseModel):
    strings: Dict[str, str] = Field(
        default_factory=dict,
        description="Translated text strings keyed by their exact id",
    )


class TranslateRequest(BaseModel):
    result: ExplainResponse
    lang: str


class RedactSpan(BaseModel):
    text: str
    type: Literal["person", "phone", "id", "address", "dob", "email"]


class RedactModel(BaseModel):
    spans: List[RedactSpan] = Field(default_factory=list)


class RedactRequest(BaseModel):
    text: str = ""
    lang: str = "en"
