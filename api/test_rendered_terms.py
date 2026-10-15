from evidence import collect_protected_renderings, names_after_honorifics, names_after_labels
from reader import READER_PROMPT_TEMPLATE, split_keyed_payload


def test_split_keyed_payload_keeps_renderings_and_flat_maps():
    strings, rendered = split_keyed_payload(
        {
            "strings": {"title": "ஆய்வக அறிக்கை"},
            "protected_terms_rendered": {"Mr. Suresh Babu": ["சுரேஷ் பாபு"]},
        }
    )
    assert strings == {"title": "ஆய்வக அறிக்கை"}
    assert rendered["Mr. Suresh Babu"] == ["சுரேஷ் பாபு"]

    flat, empty = split_keyed_payload({"title": "ஆய்வக அறிக்கை"})
    assert flat == {"title": "ஆய்வக அறிக்கை"}
    assert empty == {}


def test_collect_renderings_includes_model_spellings_and_titles():
    rendered = collect_protected_renderings(
        ["Mr. Suresh Babu", "City Diagnostics"],
        ["இது திரு. சுரேஷ் பாபு அவர்களுக்கான அறிக்கை. City Diagnostics."],
        {"Mr. Suresh Babu": ["சுரேஷ் பாபு"]},
    )
    assert "சுரேஷ் பாபு" in rendered["Mr. Suresh Babu"]
    assert any("சுரேஷ் பாபு" in key for key in rendered)
    assert names_after_honorifics("Mrs. Anita Desai signed") == ["Anita Desai"]
    assert names_after_honorifics("श्री अनिल कुमार शर्मा आए") == ["अनिल कुमार शर्मा"]
    labelled = collect_protected_renderings(
        ["Mr. Suresh Babu"],
        ["रोगी का नाम: सुरेश बाबू।"],
    )
    assert "सुरेश बाबू" in labelled["सुरेश बाबू"]
    assert names_after_labels("Patient name: Anita Desai") == ["Anita Desai"]


def test_reader_prompt_asks_for_rendered_terms():
    assert "protected_terms_rendered" in READER_PROMPT_TEMPLATE
    assert len(READER_PROMPT_TEMPLATE) < 9000
