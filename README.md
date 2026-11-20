# Dolphin

A Quilcast cast action. Open it on a cast and press Translate. It plays a run of squeaks that lasts about as long as the text, one second per 14 characters, and never longer than 20. The text seeds the song — a hash of the words picks every pitch, contour, and click rate — so the same cast sings the same tune every time, and no two casts sound alike. Words light up as they squeak, and the 🎙️ button dictates your own cast where the device ships speech recognition.

The page is static. It lives at `https://dolphin.qstorage.quilibrium.com/` once deployed.

## Preview

```
uv run python -m http.server --directory public
```

Open `http://localhost:8000/?text=hello%20from%20the%20reef` and press Translate.

## Test

```
uv run pytest
```

## Deploy

The bucket name in the manifest is `dolphin`. Keys come from QConsole → Services → QStorage → Generate API keys. They go in dotenvx, not in the source.

```
cp .env.example .env
```

Fill in the two keys, then:

```
uvx dotenvx encrypt
uvx dotenvx run -- uv run python deploy.py
```

`uvx dotenvx encrypt` writes `.env.keys` on this machine and turns `.env` into ciphertext. `.env.keys` stays out of git. After encryption, `.env` can be committed. `uv run` uses the project environment, which has boto3.

Then add the action at `https://quilcast.com/actions?add=dolphin.qstorage.quilibrium.com`.

Script and style URLs end in `?v=4`. Those files stay cached for about four hours, so bump the number in [public/index.html](public/index.html) and [public/app.js](public/app.js) when they change.
