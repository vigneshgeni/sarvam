from models import AskResponse
from reader import ASK_PROMPT_TEMPLATE, _with_doctor_note, last_ask_turns


def test_ask_prompt_allows_general_knowledge():
    text = ASK_PROMPT_TEMPLATE.format(LANG="Hindi", QUESTION="what is HbA1c?", ANALYSIS_JSON="{}")
    assert 'answered_from to "general"' in text
    assert "Please check with your doctor." in text
    assert "Never diagnose" in text
    assert "change a medicine dose" in text


def test_health_answer_ends_with_a_doctor_note():
    noted = _with_doctor_note("why is vitamin D low?", "It can be low when someone gets little sun.", "en")
    assert noted.endswith("Please check with your doctor.")
    again = _with_doctor_note("why is vitamin D low?", noted, "en")
    assert again.count("Please check with your doctor.") == 1
    plain = _with_doctor_note("when is the deadline?", "The document says 12 November.", "en")
    assert "doctor" not in plain


def test_ask_keeps_the_last_eight_turns_and_a_short_answer():
    text = ASK_PROMPT_TEMPLATE.format(LANG="English", QUESTION="why is it high?", ANALYSIS_JSON="{}")
    assert "120 words" in text
    assert '"it"' in text
    history = "\n".join(f"Q: question {i}\nA: answer {i}" for i in range(12))
    kept = last_ask_turns(history)
    assert "question 4" in kept
    assert "question 3" not in kept
    assert kept.count("Q: ") == 8


def test_general_ask_response_can_omit_a_quote():
    body = AskResponse(answer="HbA1c is a blood test.", answered_from="general", language="en")
    assert body.quote is None
    assert body.answered_from == "general"
