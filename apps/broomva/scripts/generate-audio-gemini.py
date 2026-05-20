#!/usr/bin/env python3
"""Gemini TTS chunked audio generation for writing posts.

Per memory feedback_gemini_tts.md: gemini-2.5-flash-preview-tts, Kore voice,
google-genai SDK. Falls through to chunked rendering + ffmpeg concat to MP3.

Usage: python3 scripts/generate-audio-gemini.py <slug>
"""
import os
import re
import sys
import tempfile
import subprocess
import wave
from pathlib import Path

from google import genai
from google.genai import types

SLUG = sys.argv[1] if len(sys.argv) > 1 else "the-falsification-gap-in-agent-infrastructure"
APP = Path(__file__).parent.parent
POST = APP / "content" / "writing" / f"{SLUG}.mdx"
OUT_DIR = APP / "public" / "audio" / "writing"
OUT = OUT_DIR / f"{SLUG}.mp3"

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("ERR: GEMINI_API_KEY not set")
    sys.exit(1)

MODEL = "gemini-2.5-flash-preview-tts"
VOICE = "Kore"
# Gemini TTS preview has ~32K token context window. Chunk conservatively.
CHUNK_LIMIT = 4000

client = genai.Client(api_key=API_KEY)

raw = POST.read_text()
m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.DOTALL)
if not m:
    print(f"ERR: no frontmatter in {POST}")
    sys.exit(1)
body = m.group(2)

# Mirror extractText() from generate-audio.ts
body = re.sub(r"```[\s\S]*?```", "", body)
body = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", body)
body = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", body)
body = re.sub(r"^#{1,6}\s+(.+)", r"\1.", body, flags=re.M)
body = re.sub(r"\*\*([^*]*)\*\*", r"\1", body)
body = re.sub(r"\*([^*]*)\*", r"\1", body)
body = re.sub(r"`[^`]*`", "", body)
body = re.sub(r"<[^>]+>", "", body)
body = re.sub(r"^\|.*\|$", "", body, flags=re.M)
body = re.sub(r"^---$", "", body, flags=re.M)
body = re.sub(r"^[-*]\s+", "", body, flags=re.M)
body = re.sub(r"^\d+\.\s+", "", body, flags=re.M)
body = re.sub(r"^audio:.*$", "", body, flags=re.M)
body = re.sub(r"^\[\^[^\]]+\]:.*$", "", body, flags=re.M)
body = re.sub(r"\[\^[^\]]+\]", "", body)
body = re.sub(r"\n{3,}", "\n\n", body).strip()

print(f"Post {SLUG}: {len(body):,} chars after cleaning")

# Chunk at paragraph boundaries
paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
chunks = []
cur = ""
for p in paragraphs:
    candidate = (cur + "\n\n" + p) if cur else p
    if len(candidate) <= CHUNK_LIMIT:
        cur = candidate
    else:
        if cur:
            chunks.append(cur)
        if len(p) > CHUNK_LIMIT:
            sents = re.split(r"(?<=[.!?])\s+", p)
            cur_s = ""
            for s in sents:
                cand_s = (cur_s + " " + s) if cur_s else s
                if len(cand_s) <= CHUNK_LIMIT:
                    cur_s = cand_s
                else:
                    if cur_s:
                        chunks.append(cur_s)
                    cur_s = s
            cur = cur_s
        else:
            cur = p
if cur:
    chunks.append(cur)

print(f"Chunked into {len(chunks)} segments")
for i, c in enumerate(chunks):
    print(f"  chunk {i+1}: {len(c):,} chars")

OUT_DIR.mkdir(parents=True, exist_ok=True)


def _attempt(text: str):
    resp = client.models.generate_content(
        model=MODEL,
        contents=text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=VOICE)
                )
            ),
        ),
    )
    if not resp.candidates:
        raise RuntimeError(f"no candidates; prompt_feedback={getattr(resp,'prompt_feedback',None)}")
    cand = resp.candidates[0]
    if cand.content is None:
        raise RuntimeError(f"empty content; finish_reason={getattr(cand,'finish_reason',None)} safety={getattr(cand,'safety_ratings',None)}")
    return cand.content.parts[0].inline_data.data


def synthesize(text: str, out_wav: Path) -> None:
    """Synthesize one chunk via Gemini TTS with retry; output 24kHz mono PCM as WAV."""
    import time
    last_err = None
    for attempt in range(4):
        try:
            data = _attempt(text)
            break
        except Exception as e:
            last_err = e
            print(f"  retry {attempt+1}/4 after error: {e}", flush=True)
            time.sleep(2 ** attempt)
    else:
        raise RuntimeError(f"all retries exhausted: {last_err}")
    with wave.open(str(out_wav), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(data)


with tempfile.TemporaryDirectory() as tmpd:
    tmp_wavs = []
    for i, chunk in enumerate(chunks):
        tmp = Path(tmpd) / f"chunk-{i:03d}.wav"
        print(f"Generating chunk {i+1}/{len(chunks)} ({len(chunk):,} chars)...", flush=True)
        synthesize(chunk, tmp)
        size_kb = tmp.stat().st_size / 1024
        print(f"  → {size_kb:.0f} KB")
        tmp_wavs.append(tmp)

    # Concatenate WAVs, then encode single MP3 in one ffmpeg invocation
    list_file = Path(tmpd) / "concat.txt"
    list_file.write_text("\n".join(f"file '{p}'" for p in tmp_wavs))
    print(f"Concatenating {len(tmp_wavs)} chunks → {OUT}")
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0", "-i", str(list_file),
            "-codec:a", "libmp3lame", "-b:a", "128k",
            str(OUT),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

size_mb = OUT.stat().st_size / 1024 / 1024
print(f"Done: {OUT} ({size_mb:.2f} MB)")
