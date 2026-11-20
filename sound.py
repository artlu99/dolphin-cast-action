"""How long the translation plays, and the whistles and click trains inside it.

The page copies these rules in public/sound.js. About one second per 14
characters: a short cast is a short call, a long one keeps going, and
nothing runs past twenty seconds. The text also seeds the song: a hash of
the words picks every pitch, contour, click rate, and the drift across the
stereo field, so the same cast sings the same song every time, and no two
casts sound alike. sound.py mirrors sound.js bit for bit, and the tests
check the two agree when node is on the machine.
"""

import math

PATTERN = (
    ("whistle", 0.7),
    ("clicks", 0.32),
    ("whistle", 0.5),
    ("clicks", 0.22),
)
PAUSE = 0.07
CONTOURS = (
    {"from": 0.72, "mid": 1.55, "to": 0.9, "bend": 0.42},
    {"from": 0.9, "mid": 1.5, "to": 0.65, "bend": 0.5},
    {"from": 1.3, "mid": 0.8, "to": 1.0, "bend": 0.45},
    {"from": 0.7, "mid": 1.2, "to": 1.55, "bend": 0.6},
    {"from": 1.45, "mid": 0.75, "to": 0.85, "bend": 0.4},
)


def seed_from(text: str) -> int:
    """FNV-1a, one round per UTF-8 byte."""
    seed = 0x811C9DC5
    for byte in str(text or "").encode("utf-8"):
        seed ^= byte
        seed = (seed * 0x01000193) & 0xFFFFFFFF
    return seed


def _random(seed: int):
    """mulberry32, matching Math.imul wrap-around exactly."""
    state = seed & 0xFFFFFFFF

    def step() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((state ^ (state >> 15)) * (state | 1)) & 0xFFFFFFFF
        t = (t ^ ((t + ((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return step


def _round3(value: float) -> float:
    """Math.round(value * 1000) / 1000, for non-negative values."""
    return math.floor(value * 1000 + 0.5) / 1000


def duration_seconds(text: str) -> float:
    count = len(str(text or "").strip())
    if not count:
        return 0
    return min(20, max(0.8, count / 14))


def calls(duration: float, seed: int = 0) -> list[dict]:
    events: list[dict] = []
    random = _random(seed)
    pan = (random() * 2 - 1) * 0.5

    def drift() -> float:
        nonlocal pan
        pan = max(-0.85, min(0.85, pan + (random() * 2 - 1) * 0.6))
        return _round3(pan)

    at = 0.0
    index = 0
    while at < duration - 0.05:
        kind, base = PATTERN[index % len(PATTERN)]
        jitter = 0.75 + random() * 0.5
        length = min(base * jitter, _round3(duration - at))
        if length < 0.08:
            break
        event = {"at": _round3(at), "kind": kind, "length": _round3(length), "pan": drift()}
        if kind == "whistle":
            event["pitch"] = math.floor(2200 + random() * 2200 + 0.5)
            event.update(CONTOURS[math.floor(random() * len(CONTOURS))])
        else:
            event["rate"] = math.floor(55 + random() * 45 + 0.5)
        events.append(event)
        at += length + PAUSE
        index += 1
    if not events:
        event = {"at": 0, "kind": "whistle", "length": _round3(min(0.5, duration)), "pan": drift()}
        event["pitch"] = math.floor(2200 + random() * 2200 + 0.5)
        event.update(CONTOURS[math.floor(random() * len(CONTOURS))])
        events.append(event)
    return events
