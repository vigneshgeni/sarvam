import pytest
from lf.pii import CardNumberRejected, looks_like_card_number, mask_pii, reject_card_numbers


def test_mask_phone_email_url():
    text = "Call 9876543210 or +91 98765 43210, email asha@example.com see https://evil.example/x"
    out = mask_pii(text)
    assert "9876543210" not in out
    assert "asha@example.com" not in out
    assert "https://" not in out
    assert "[hidden]" in out


def test_mask_aadhaar_and_pan():
    out = mask_pii("Aadhaar 1234 5678 9012 PAN ABCDE1234F passport Z1234567")
    assert "1234 5678 9012" not in out
    assert "ABCDE1234F" not in out
    assert "Z1234567" not in out


def test_card_luhn_rejected():
    # Visa test pattern that passes Luhn
    number = "4111111111111111"
    assert looks_like_card_number(f"my card is {number}")
    with pytest.raises(CardNumberRejected):
        reject_card_numbers("please send 4111111111111111")
