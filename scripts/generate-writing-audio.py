#!/usr/bin/env python3
"""Generate audio narration for writing posts using edge-tts."""

import asyncio
import re
import os
import sys

CONTENT_DIR = "/Users/broomva/broomva/broomva.tech/apps/chat/content/writing"
AUDIO_DIR = "/Users/broomva/broomva/broomva.tech/apps/chat/public/audio/writing"

POSTS = [
    ("artificial-cognition-from-jung-to-neural-nets", "en-US-AndrewMultilingualNeural"),
    ("blockchain-as-audit-trail", "en-US-AndrewMultilingualNeural"),
    ("computer-vision-for-on-site-safety", "en-US-AndrewMultilingualNeural"),
    ("control-systems-as-self-engineering", "en-US-AndrewMultilingualNeural"),
    ("data-monetization", "en-US-AndrewMultilingualNeural"),
    ("git-decentralization", "en-US-AndrewMultilingualNeural"),
    ("iiot-as-a-service-and-concerns-on-privacy", "es-CO-GonzaloNeural"),
    ("iiot-from-edge-to-cloud", "es-CO-GonzaloNeural"),
    ("inteligencia-artificial-en-la-industria-colombiana", "es-CO-GonzaloNeural"),
    ("letter-from-the-machine-ii", "en-US-AndrewMultilingualNeural"),
    ("probability-patterns-and-decision-making", "en-US-AndrewMultilingualNeural"),
    ("quantum-computing", "en-US-AndrewMultilingualNeural"),
    ("what-do-you-sell-when-everyone-can-build-anything", "en-US-AndrewMultilingualNeural"),
]


def extract_body(mdx_content: str) -> str:
    """Extract body text after frontmatter (second ---)."""
    parts = mdx_content.split("---")
    if len(parts) >= 3:
        # Everything after the second ---
        return "---".join(parts[2:])
    return mdx_content


def clean_for_tts(text: str) -> str:
    """Clean markdown/MDX text for TTS narration."""
    # Remove image tags: ![alt](url)
    text = re.sub(r'!\[.*?\]\(.*?\)', '', text)
    # Remove HTML/JSX image tags
    text = re.sub(r'<img[^>]*/?>', '', text)
    # Remove video tags
    text = re.sub(r'<video[^>]*>.*?</video>', '', text, flags=re.DOTALL)
    # Remove code blocks (``` ... ```)
    text = re.sub(r'```[\s\S]*?```', '', text)
    # Remove inline code
    text = re.sub(r'`[^`]+`', '', text)
    # Remove LaTeX display math ($$...$$)
    text = re.sub(r'\$\$[\s\S]*?\$\$', '', text)
    # Remove inline LaTeX ($...$)
    text = re.sub(r'\$[^$]+\$', '', text)
    # Remove markdown links but keep text: [text](url) -> text
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    # Remove standalone URLs
    text = re.sub(r'https?://\S+', '', text)
    # Remove horizontal rules (--- on its own line)
    text = re.sub(r'^---+\s*$', '', text, flags=re.MULTILINE)
    # Remove markdown headings markers but keep text
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    # Remove bold markers
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
    # Remove italic markers
    text = re.sub(r'\*([^*]+)\*', r'\1', text)
    # Remove table formatting (lines with |)
    text = re.sub(r'^\|.*\|$', '', text, flags=re.MULTILINE)
    # Convert bullet list items to sentences (remove leading - or *)
    text = re.sub(r'^[\s]*[-*]\s+', '', text, flags=re.MULTILINE)
    # Remove numbered list markers
    text = re.sub(r'^[\s]*\d+\.\s+', '', text, flags=re.MULTILINE)
    # Remove HTML-style comments
    text = re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)
    # Remove JSX/HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Collapse multiple blank lines into one
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Remove leading/trailing whitespace
    text = text.strip()
    return text


def add_audio_to_frontmatter(mdx_path: str, slug: str) -> bool:
    """Add audio field to MDX frontmatter."""
    with open(mdx_path, 'r') as f:
        content = f.read()

    audio_line = f"audio: /audio/writing/{slug}.mp3"

    # Check if audio is already present
    if "audio:" in content:
        print(f"  Audio field already present in {slug}, skipping frontmatter update")
        return True

    # Find the closing --- of frontmatter
    # Split by --- to find frontmatter boundaries
    parts = content.split("---")
    if len(parts) < 3:
        print(f"  ERROR: Could not parse frontmatter in {slug}")
        return False

    # Insert audio before closing ---
    frontmatter = parts[1].rstrip()
    frontmatter += f"\n{audio_line}\n"
    parts[1] = frontmatter
    new_content = "---".join(parts)

    with open(mdx_path, 'w') as f:
        f.write(new_content)

    return True


async def generate_audio(slug: str, voice: str) -> bool:
    """Generate audio for a single post."""
    import edge_tts

    mdx_path = os.path.join(CONTENT_DIR, f"{slug}.mdx")
    audio_path = os.path.join(AUDIO_DIR, f"{slug}.mp3")

    if not os.path.exists(mdx_path):
        print(f"  ERROR: MDX file not found: {mdx_path}")
        return False

    # Read and clean content
    with open(mdx_path, 'r') as f:
        content = f.read()

    body = extract_body(content)
    clean_text = clean_for_tts(body)

    if not clean_text.strip():
        print(f"  ERROR: No text content extracted for {slug}")
        return False

    print(f"  Text length: {len(clean_text)} chars, voice: {voice}")

    # Generate audio
    try:
        communicate = edge_tts.Communicate(clean_text, voice)
        await communicate.save(audio_path)
        file_size = os.path.getsize(audio_path)
        print(f"  Audio saved: {audio_path} ({file_size / 1024:.0f} KB)")
    except Exception as e:
        print(f"  ERROR generating audio: {e}")
        return False

    # Update frontmatter
    if not add_audio_to_frontmatter(mdx_path, slug):
        return False

    return True


async def main():
    os.makedirs(AUDIO_DIR, exist_ok=True)

    succeeded = []
    failed = []

    for slug, voice in POSTS:
        print(f"\nProcessing: {slug}")
        try:
            result = await generate_audio(slug, voice)
            if result:
                succeeded.append(slug)
                print(f"  SUCCESS")
            else:
                failed.append(slug)
                print(f"  FAILED")
        except Exception as e:
            failed.append(slug)
            print(f"  FAILED with exception: {e}")

    print(f"\n{'='*60}")
    print(f"Results: {len(succeeded)} succeeded, {len(failed)} failed")
    print(f"\nSucceeded ({len(succeeded)}):")
    for s in succeeded:
        print(f"  - {s}")
    if failed:
        print(f"\nFailed ({len(failed)}):")
        for f in failed:
            print(f"  - {f}")

    return len(failed) == 0


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
