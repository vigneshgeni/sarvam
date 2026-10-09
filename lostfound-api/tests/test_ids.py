from lf.ids import (
    aadhaar_lite_key,
    luhn_ok,
    match_key,
    name_keys,
    name_tokens,
    normalize_id,
    validate_id,
)
import pytest

PEPPER = "test-pepper-one"
PEPPER2 = "test-pepper-two"

TABLE = [
    ("passport", "Z1234567", True),
    ("passport", "z-123-4567", True),
    ("passport", "ZZ1234567", False),
    ("passport", "Z123456", False),
    ("pan_card", "ABCDE1234F", True),
    ("pan_card", "abcde1234f", True),
    ("pan_card", "ABCDE12345", False),
    ("voter_id", "ABC1234567", True),
    ("voter_id", "AB1234567", False),
    ("driving_licence", "TN0120230012345", True),
    ("driving_licence", "TN01 20230012345", True),
    ("driving_licence", "TN01", False),
    ("vehicle_rc", "DL1CAF1234", True),
    ("vehicle_rc", "KA03AB1234", True),
    ("vehicle_rc", "K3", False),
    ("imei", "490154203237518", True),
    ("imei", "490154203237519", False),
    ("imei", "12345", False),
    ("other_id", "AB12CD34", True),
    ("other_id", "abc", False),
]


@pytest.mark.parametrize("id_type,raw,ok", TABLE)
def test_validate_table(id_type, raw, ok):
    if ok:
        assert validate_id(id_type, raw) == normalize_id(raw)
    else:
        with pytest.raises(ValueError):
            validate_id(id_type, raw)


def test_hmac_determinism():
    a = match_key(PEPPER, "passport", "Z1234567")
    b = match_key(PEPPER, "passport", "Z1234567")
    assert a == b
    assert len(a) == 64


def test_different_type_different_key():
    n = "ABCDE1234F"
    assert match_key(PEPPER, "pan_card", n) != match_key(PEPPER, "other_id", n)


def test_pepper_change():
    assert match_key(PEPPER, "passport", "Z1234567") != match_key(PEPPER2, "passport", "Z1234567")


def test_imei_luhn():
    assert luhn_ok("490154203237518")
    assert not luhn_ok("490154203237519")


def test_name_tokens_strip_titles():
    assert name_tokens("Dr. Asha Verma") == ["asha", "verma"]
    keys = name_keys(PEPPER, "Smt. Asha Verma")
    assert len(keys) == 2
    assert keys != name_keys(PEPPER2, "Smt. Asha Verma")


def test_aadhaar_lite_not_full_number():
    k = aadhaar_lite_key(PEPPER, "4321", "1990")
    assert "4321" not in k
    assert k != aadhaar_lite_key(PEPPER, "4321", "1991")
