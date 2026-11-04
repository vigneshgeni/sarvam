from models import AskResponse
from reader import (
    ASK_FALLBACK_TIMEOUT,
    ASK_PROMPT_TEMPLATE,
    ASK_TIMEOUT,
    _close_answer,
    _with_doctor_note,
    ask_call_settings,
    guard_ask_numbers,
    last_ask_turns,
    trim_ask_analysis,
)


def test_ask_prompt_allows_general_knowledge():
    text = ASK_PROMPT_TEMPLATE.format(LANG="Hindi", KIND="lab report", QUESTION="what is HbA1c?", ANALYSIS_JSON="{}")
    assert "friendly assistant" in text
    assert "not a doctor, lawyer, or financial adviser" in text
    assert 'answered_from to "general"' in text
    assert "Please check with your doctor." in text
    assert "not financial advice" in text
    assert "Never diagnose" in text
    assert "change a medicine dose" in text
    assert "follow_ups" in text


def test_health_answer_ends_with_a_doctor_note():
    noted = _with_doctor_note("why is vitamin D low?", "It can be low when someone gets little sun.", "en")
    assert noted.endswith("Please check with your doctor.")
    again = _with_doctor_note("why is vitamin D low?", noted, "en")
    assert again.count("Please check with your doctor.") == 1
    plain = _with_doctor_note("when is the deadline?", "The document says 12 November.", "en")
    assert "doctor" not in plain


def test_ask_keeps_the_last_eight_turns_and_a_short_answer():
    text = ASK_PROMPT_TEMPLATE.format(LANG="English", KIND="document", QUESTION="why is it high?", ANALYSIS_JSON="{}")
    assert "150 words" in text
    assert '"it"' in text
    history = "\n".join(f"Q: question {i}\nA: answer {i}" for i in range(12))
    kept = last_ask_turns(history)
    assert "question 4" in kept
    assert "question 3" not in kept
    assert kept.count("Q: ") == 8


def test_ask_gives_the_primary_model_time_and_a_short_context():
    assert 8 <= ASK_TIMEOUT <= 12
    assert ASK_TIMEOUT + ASK_FALLBACK_TIMEOUT <= 45
    assert ask_call_settings("Why can haemoglobin be low?") == (0.3, 512)
    assert ask_call_settings("What is the haemoglobin value?") == (0.0, 0)
    long_text = "x" * 9000
    packed = json_result(long_text)
    analysis, kind = trim_ask_analysis(packed)
    assert len(analysis) <= 8000
    assert "source_text" not in analysis
    assert kind == "lab_report"
    legal = _close_answer("What is my deadline?", "Appear on 12 November.", "en", "court_legal")
    assert legal.endswith("office named in the document.")
    money = _close_answer("Why was money cut?", "The letter shows a deduction.", "ta", "insurance")
    assert "நிதி ஆலோசனை" in money


def json_result(source: str) -> str:
    import json
    return json.dumps({"document_kind": "lab_report", "source_text": source, "summary": ["A short summary"]})


def test_number_guard_flags_an_invented_figure_and_drops_it_from_facts():
    reply = AskResponse(
        answer="The amount is 99999.",
        facts=[{"label": "Due", "value": "Rs 99999"}, {"label": "Due", "value": "Rs 1200"}],
        follow_ups=["one two three four five six seven eight nine"],
        language="en",
    )
    guard_ask_numbers(reply, {"1200"})
    assert reply.evidence == "check_original"
    assert [fact.value for fact in reply.facts] == ["Rs 1200"]
    assert len(reply.follow_ups[0].split()) == 8


def test_general_ask_response_can_omit_a_quote():
    body = AskResponse(answer="HbA1c is a blood test.", answered_from="general", language="en")
    assert body.quote is None
    assert body.answered_from == "general"


def test_a_busy_backup_model_is_retried_once():
    from unittest.mock import MagicMock, patch
    from google.genai import errors
    from reader import GeminiServiceError, call_gemini_with_retry

    busy = errors.ClientError(429, {"error": {"message": "too many requests"}})
    client = MagicMock()
    client.models.generate_content.side_effect = [busy, busy, busy]
    seen = []

    def record(*_args, **kwargs):
        seen.append(kwargs.get("model"))
        raise busy

    client.models.generate_content.side_effect = record
    with patch("time.sleep", return_value=None):
        try:
            call_gemini_with_retry(
                client=client,
                model="gemini-3.7-flash",
                contents=["question"],
                config=MagicMock(),
                endpoint="ask",
                deadline=30,
            )
            raise AssertionError("a busy backup should stop after one retry")
        except GeminiServiceError as exc:
            assert exc.status_code == 503
    assert seen == ["gemini-3.7-flash", "gemini-2.5-flash", "gemini-2.5-flash"]


def test_explain_limits_parallel_chunks_and_keeps_the_ones_that_worked():
    from unittest.mock import patch
    from concurrent.futures import ThreadPoolExecutor
    from models import ReaderResponse
    from reader import GeminiServiceError, read_document

    seen = {}

    class RecordingPool:
        def __init__(self, max_workers):
            seen["workers"] = max_workers
            self._pool = ThreadPoolExecutor(max_workers=max_workers)

        def __enter__(self):
            self._pool.__enter__()
            return self

        def __exit__(self, *args):
            return self._pool.__exit__(*args)

        def map(self, fn, items):
            return self._pool.map(fn, items)

    def fake_single(_files, _lang, deadline=None, page_start=None, page_end=None):
        if page_start == 6:
            raise GeminiServiceError("busy", 503)
        return ReaderResponse(title=f"Pages {page_start}-{page_end}", summary=["Kept."], language="en")

    with patch("reader.pdf_page_chunks", return_value=[(b"a", 1, 5), (b"b", 6, 10), (b"c", 11, 12)]), \
         patch("reader.read_document_single_attempt", side_effect=fake_single), \
         patch("reader.ThreadPoolExecutor", RecordingPool):
        result = read_document([(b"%PDF", "application/pdf")], "en")

    assert seen["workers"] == 2
    assert result.title == "Pages 1-5"
    assert [section for section in (result.sections or [])] == []
    assert "Kept." in result.summary
