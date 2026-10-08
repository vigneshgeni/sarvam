from lf.geo import city_centre, geohash_encode, geohash_neighbours, haversine_km, lookup_city


def test_geohash_length_and_neighbours():
    h = geohash_encode(13.0827, 80.2707, 7)
    assert len(h) == 7
    n = geohash_neighbours(h)
    assert h in n
    assert len(n) >= 5


def test_haversine_chennai_adyar():
    km = haversine_km(13.0827, 80.2707, 13.0067, 80.2573)
    assert 5 < km < 15


def test_city_lookup():
    assert lookup_city("Bangalore")["key"] == "bengaluru"
    assert lookup_city("Chennai")["key"] == "chennai"
    latlng = city_centre("Mumbai")
    assert latlng and abs(latlng[0] - 19.076) < 0.1
