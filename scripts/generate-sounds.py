#!/usr/bin/env python3
"""Create the original, short Omarchy Chess WAV cues.

Only Python's standard library is used.  Each cue is synthesized from sine
tones with a short attack/release envelope and normalized to a conservative
peak, so the output is deterministic, small, and safe to play at full volume.
"""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "sounds"
RATE = 44_100
PEAK = 0.46


# (start, duration, start_frequency, end_frequency, amplitude, harmonic_mix)
Cue = tuple[float, float, float, float, float, float]


CUES: dict[str, tuple[float, tuple[Cue, ...]]] = {
    "move": (
        0.105,
        ((0.0, 0.105, 520.0, 470.0, 1.0, 0.18),),
    ),
    "capture": (
        0.145,
        ((0.0, 0.145, 270.0, 188.0, 1.0, 0.34), (0.0, 0.045, 880.0, 520.0, 0.23, 0.0)),
    ),
    "castle": (
        0.255,
        ((0.0, 0.105, 330.0, 296.0, 0.82, 0.16), (0.115, 0.14, 494.0, 440.0, 0.78, 0.14)),
    ),
    "check": (
        0.18,
        ((0.0, 0.075, 740.0, 680.0, 0.8, 0.08), (0.092, 0.075, 554.0, 508.0, 0.72, 0.08)),
    ),
    "victory": (
        0.49,
        ((0.0, 0.15, 392.0, 392.0, 0.78, 0.12), (0.14, 0.15, 494.0, 494.0, 0.76, 0.12), (0.28, 0.21, 587.0, 587.0, 0.82, 0.14)),
    ),
    "draw": (
        0.37,
        ((0.0, 0.16, 392.0, 370.0, 0.72, 0.12), (0.18, 0.17, 329.0, 310.0, 0.66, 0.12)),
    ),
    "timeout": (
        0.31,
        ((0.0, 0.145, 540.0, 390.0, 0.8, 0.16), (0.155, 0.145, 320.0, 220.0, 0.78, 0.18)),
    ),
}


def envelope(local_time: float, duration: float) -> float:
    attack = min(1.0, local_time / 0.009)
    release = min(1.0, max(0.0, (duration - local_time) / 0.045))
    # A gently rounded body keeps the cue quiet without sounding clipped.
    body = 0.88 + 0.12 * math.sin(math.pi * min(1.0, local_time / duration))
    return attack * release * body


def render(duration: float, tones: tuple[Cue, ...]) -> bytes:
    count = round(duration * RATE)
    samples = [0.0] * count
    for start, length, start_hz, end_hz, amplitude, harmonic_mix in tones:
        first = max(0, round(start * RATE))
        last = min(count, round((start + length) * RATE))
        for index in range(first, last):
            local = index / RATE - start
            progress = min(1.0, max(0.0, local / length))
            frequency = start_hz + (end_hz - start_hz) * progress
            phase = 2.0 * math.pi * frequency * local
            fundamental = math.sin(phase)
            harmonic = math.sin(phase * 2.01) * harmonic_mix
            samples[index] += amplitude * envelope(local, length) * (fundamental + harmonic)

    peak = max((abs(value) for value in samples), default=1.0)
    scale = PEAK / peak if peak else 1.0
    pcm = bytearray()
    for value in samples:
        # The normalization and clamp make the no-clipping guarantee explicit.
        normalized = max(-1.0, min(1.0, value * scale))
        pcm.extend(struct.pack("<h", round(normalized * 32767)))
    return bytes(pcm)


def write_wav(path: Path, pcm: bytes) -> None:
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(pcm)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, (duration, tones) in CUES.items():
        write_wav(OUTPUT / f"{name}.wav", render(duration, tones))
    print(f"generated {len(CUES)} original WAV cues in {OUTPUT}")


if __name__ == "__main__":
    main()
