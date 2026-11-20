"""How long the translation plays, and the whistles and click trains inside it.

The page copies these rules in public/sound.js. About one second per 14
characters: a short cast is a short call, a long one keeps going, and
nothing runs past twenty seconds.
"""

PATTERN = (
    ("whistle", 0.7),
    ("clicks", 0.32),
    ("whistle", 0.5),
    ("clicks", 0.22),
)
PAUSE = 0.07


def duration_seconds(text: str) -> float:
    count = len(str(text or "").strip())
    if not count:
        return 0
    return min(20, max(0.8, count / 14))


def calls(duration: float) -> list[dict]:
    events = []
    at = 0.0
    index = 0
    while at < duration - 0.05:
        kind, step = PATTERN[index % len(PATTERN)]
        length = min(step, round((duration - at) * 1000) / 1000)
        if length < 0.08:
            break
        events.append({"at": round(at * 1000) / 1000, "kind": kind, "length": length})
        at += length + PAUSE
        index += 1
    if not events:
        events.append({"at": 0, "kind": "whistle", "length": min(0.5, duration)})
    return events
