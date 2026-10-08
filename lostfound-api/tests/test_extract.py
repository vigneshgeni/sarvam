from lf.extract import extract_with_client, reduce_aadhaar_fields, strip_aadhaar


def test_strip_aadhaar_to_last4():
    text, last4 = strip_aadhaar("Name Asha Verma 2345 6789 0123")
    assert "234567890123" not in text.replace(" ", "")
    assert last4 == "0123"
    assert "[hidden]" in text


def test_fake_gemini_drops_full_number():
    result = extract_with_client(
        {
            "categoryGuess": "aadhaar_card",
            "fields": {"name": "Asha Verma", "idType": "aadhaar_card", "idNumber": "234567890123"},
        }
    )
    assert result["fields"].get("idNumber") in {None, ""}
    assert result["fields"]["last4"] == "0123"
    assert result["evidence"] == "check_original"


def test_reduce_helper():
    out = reduce_aadhaar_fields({"idType": "aadhaar_card", "idNumber": "123412341234", "name": "Test"})
    assert "idNumber" not in out or not out["idNumber"]
    assert out["last4"] == "1234"
