from pathlib import Path

from sound import calls, duration_seconds


def test_an_empty_cast_is_silent():
    assert duration_seconds("") == 0
    assert duration_seconds("   ") == 0


def test_length_follows_the_text_and_stays_inside_the_bounds():
    assert duration_seconds("x" * 5) == 0.8
    assert duration_seconds("x" * 14) == 1
    assert duration_seconds("x" * (14 * 20)) == 20
    assert duration_seconds("x" * (14 * 40)) == 20


def test_calls_are_whistles_and_clicks_that_fit_the_duration():
    duration = duration_seconds("hello from the reef")
    events = calls(duration)
    assert len(events) > 1
    assert events[0]["at"] == 0
    assert {event["kind"] for event in events} <= {"whistle", "clicks"}
    assert any(event["kind"] == "whistle" and event["length"] >= 0.4 for event in events)
    assert all(event["at"] + event["length"] <= duration + 1e-9 for event in events)


def test_the_page_uses_the_same_rules():
    script = Path("public/sound.js").read_text()
    assert "function calls" in script
    assert "chirp" not in script.lower()
    assert 'kind: "whistle"' in script
    assert 'kind: "clicks"' in script
    assert "Math.min(20, Math.max(0.8, count / 14))" in script
