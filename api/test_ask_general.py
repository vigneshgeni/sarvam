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
    assert ASK_TIMEOUT >= 25
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
