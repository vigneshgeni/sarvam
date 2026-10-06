from typing import List, Optional
from pydantic import BaseModel, Field


class ReaderAction(BaseModel):
    text: str = Field(description="Action description in the requested language")
    due_date: Optional[str] = Field(
        default=None,
        description="Due date in YYYY-MM-DD format if printed, else null"
    )
    deadline_rule: Optional[str] = Field(
        default=None,
        description="Relative deadline rule text, e.g. 'within 30 days of this letter', else null"
    )
    quote: str = Field(
        description="Exact verbatim source text from the document in original language"
    )
    page: int = Field(
        default=1,
        description="Page number where the quote is located"
    )


class ReaderWarning(BaseModel):
    text: str = Field(description="Warning description in the requested language")
    quote: str = Field(
        description="Exact verbatim source text from the document in original language"
    )
    page: int = Field(
        default=1,
        description="Page number where the quote is located"
    )


class ReaderFact(BaseModel):
    text: str = Field(description="Fact description in the requested language")
    quote: str = Field(
        description="Exact verbatim source text from the document in original language"
    )
    page: int = Field(
        default=1,
        description="Page number where the quote is located"
    )


class ReaderResponse(BaseModel):
    doc_type: str = Field(
        description="Document type: government_notice, utility_bill, insurance, lab_report, bank, school, other"
    )
    title: str = Field(description="Document title in the requested language")
    language: str = Field(description="Language code, e.g. ta, hi, en")
    letter_date: Optional[str] = Field(
        default=None,
        description="Date of the notice or letter in YYYY-MM-DD if printed, else null"
    )
    summary: List[str] = Field(
        description="2-4 sentence explanation in the requested language"
    )
    actions: List[ReaderAction] = Field(
        default_factory=list,
        description="Actions required, most important first"
    )
    warnings: List[ReaderWarning] = Field(
        default_factory=list,
        description="Only warnings stated in the document itself"
    )
    facts: List[ReaderFact] = Field(
        default_factory=list,
        description="Key facts (amounts, IDs, dates, names) from the document"
    )
    conflicts: List[str] = Field(
        default_factory=list,
        description="Contradictory dates or amounts if present in the document"
    )
    unreadable: bool = Field(
        default=False,
        description="True if document or page is blurry, cut off or unreadable"
    )
    unreadable_reason: Optional[str] = Field(
        default=None,
        description="Reason why the document is unreadable, else null"
    )


class ErrorResponse(BaseModel):
    message: str
    message_local: str
