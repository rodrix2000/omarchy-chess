# Sound Assets

The checked-in WAVs are short, original cues for `move`, `capture`, `castle`,
`check`, `victory`, `draw`, and `timeout`.  `victory.wav` is the result/win cue.
The in-game check alert uses a warm, descending two-note chime so it remains
distinct from move sounds without becoming harsh during repeated checks.
They are optional presentation only: sound failure, disabled sound, or a
missing file never affects chess state or move legality.

Each file is mono, 44.1 kHz, 16-bit PCM, shorter than 0.5 seconds, and
normalized to a 0.46 full-scale peak.  There is no music or looping audio.

## Rebuild

From the repository root:

```bash
python3 scripts/generate-sounds.py
```

The generator uses only Python's standard library.  It creates deterministic
sine-wave tones with short attack/release envelopes and writes the WAV headers
itself; no downloaded samples or audio libraries are required.

## License and playback

These generated cues are project-owned original assets distributed under the
repository MIT License.  Playback should honor the user's independent sound
enabled and volume settings, play a cue only after an authoritative commit,
and silently fall back when Qt Multimedia is unavailable.
