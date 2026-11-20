from pathlib import Path
import shutil
import subprocess
import json

import pytest

from sound import calls, duration_seconds, seed_from


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


def test_the_same_text_sings_the_same_song():
    duration = duration_seconds("hello from the reef")
    first = calls(duration, seed_from("hello from the reef"))
    second = calls(duration, seed_from("hello from the reef"))
    assert first == second


def test_different_texts_sound_different():
    duration = duration_seconds("hello from the reef")
    assert calls(duration, seed_from("hello from the reef")) != calls(duration, seed_from("goodbye from the reef"))


def test_every_call_carries_its_signature():
    for text in ("a", "hello from the reef, dolphin friends! 🐬", "word " * 120):
        events = calls(duration_seconds(text), seed_from(text))
        for event in events:
            assert -0.85 <= event["pan"] <= 0.85
            if event["kind"] == "whistle":
                assert 2200 <= event["pitch"] <= 4400
                assert 0 < event["from"] < 2 and 0 < event["mid"] < 2 and 0 < event["to"] < 2
                assert 0.3 < event["bend"] < 0.7
            else:
                assert 55 <= event["rate"] <= 100


def test_the_page_uses_the_same_rules():
    script = Path("public/sound.js").read_text()
    assert "function calls" in script
    assert "chirp" not in script.lower()
    assert 'kind: "whistle"' in script
    assert 'kind: "clicks"' in script
    assert "Math.min(20, Math.max(0.8, count / 14))" in script


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not on the machine")
@pytest.mark.parametrize("text", ["a", "hello from the reef, dolphin friends! 🐬", "the sea was angry that day"])
def test_python_and_the_page_agree_note_for_note(text):
    script = (
        "import { calls, durationSeconds, seedFrom } from %r\n"
        "const t = process.argv[1]\n"
        "console.log(JSON.stringify(calls(durationSeconds(t), seedFrom(t))))\n" % str(Path("public/sound.js").resolve())
    )
    page = json.loads(subprocess.run(
        ["node", "--input-type=module", "-e", script, text],
        capture_output=True, text=True, check=True, timeout=30,
    ).stdout)
    ours = calls(duration_seconds(text), seed_from(text))
    assert len(page) == len(ours)
    for seen, made in zip(page, ours):
        assert seen == pytest.approx(made)
