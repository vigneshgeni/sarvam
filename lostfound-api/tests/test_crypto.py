from lf.crypto import decrypt_field, encrypt_field


def test_roundtrip():
    token = encrypt_field("+91 00000 00000")
    assert token and "+91" not in token
    assert decrypt_field(token) == "+91 00000 00000"


def test_empty():
    assert encrypt_field("") is None
    assert decrypt_field(None) is None
