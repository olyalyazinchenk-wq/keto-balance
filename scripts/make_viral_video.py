import os
import sys
import math
import wave
import struct
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import cv2
import subprocess

# 1. Synthesize background lofi music track
def generate_bg_music(path='media/bg_music.wav', duration=36.0, sr=44100):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    audio = np.zeros_like(t)
    
    # Tempo: 85 BPM (0.705s per beat)
    beat_len = 60.0 / 85.0
    chord_len = beat_len * 4
    
    # Chill chord progression in C minor / Eb: Cm7 -> Abmaj7 -> Fm7 -> Gm7
    chords = [
        [261.63, 311.13, 392.00, 466.16],  # Cm7
        [207.65, 261.63, 311.13, 392.00],  # Abmaj7
        [174.61, 207.65, 261.63, 311.13],  # Fm7
        [196.00, 233.08, 293.66, 349.23],  # Gm7
    ]
    
    total_chords = int(duration / chord_len) + 1
    for ci in range(total_chords):
        c_start = ci * chord_len
        notes = chords[ci % len(chords)]
        for note in notes:
            c_t = t[(t >= c_start) & (t < c_start + chord_len)] - c_start
            idx = np.where((t >= c_start) & (t < c_start + chord_len))[0]
            if len(idx) > 0:
                # Warm electric piano / rhodes envelope
                env = np.exp(-c_t * 0.9) * 0.12
                wave = np.sin(2 * np.pi * note * c_t) + 0.3 * np.sin(2 * np.pi * note * 2 * c_t)
                audio[idx] += wave * env
                
    # Add soft kick and snare groove
    total_beats = int(duration / beat_len) + 1
    for bi in range(total_beats):
        b_time = bi * beat_len
        # Kick on beat 1, 3
        if bi % 2 == 0:
            k_idx = np.where((t >= b_time) & (t < b_time + 0.18))[0]
            if len(k_idx) > 0:
                kt = t[k_idx] - b_time
                freq = 110 * np.exp(-kt * 28) + 45
                audio[k_idx] += np.sin(2 * np.pi * freq * kt) * np.exp(-kt * 18) * 0.28
        # Snare / rimshot on beat 2, 4
        else:
            s_idx = np.where((t >= b_time) & (t < b_time + 0.12))[0]
            if len(s_idx) > 0:
                st = t[s_idx] - b_time
                noise = np.random.uniform(-1, 1, len(st)) * np.exp(-st * 25) * 0.14
                tone = np.sin(2 * np.pi * 220 * st) * np.exp(-st * 30) * 0.10
                audio[s_idx] += noise + tone
                
    # Normalization
    audio = audio / (np.max(np.abs(audio)) + 1e-6) * 0.7
    audio_int16 = (audio * 32767).astype(np.int16)
    
    with wave.open(path, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(audio_int16.tobytes())
    print(f'BG music saved: {path}')

generate_bg_music()
