#!/usr/bin/env python3
"""Berkas probe: nada 1 detik / hening 1 detik berulang, untuk memastikan
Chromium benar-benar memutar --use-file-for-fake-audio-capture."""

import array
import math
import sys
import wave
from pathlib import Path

RATE = 48000
SECONDS = 40


def main() -> int:
    out = Path(__file__).parent / "probe-tone.wav"
    a = array.array("h")
    for s in range(SECONDS):
        loud = s % 2 == 0
        for i in range(RATE):
            a.append(int(20000 * math.sin(2 * math.pi * 440 * i / RATE)) if loud else 0)
    with wave.open(str(out), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(a.tobytes())
    print(f"OK -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
