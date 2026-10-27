import numpy as np
import wave
import struct

def generate_lofi_track(filename='media/bg_music.wav', duration=36.0, sr=44100):
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    
    # Lofi chord progression: Cmaj7 (261.63, 329.63, 392.00, 493.88), Am7 (220, 261.63, 329.63, 392), Fmaj7 (174.61, 220, 261.63, 329.63), G7 (196, 246.94, 293.66, 349.23)
    chords = [
        [261.63, 329.63, 392.00, 493.88],  # Cmaj7
        [220.00, 261.63, 329.63, 392.00],  # Am7
        [174.61, 220.00, 261.63, 329.63],  # Fmaj7
        [196.00, 246.94, 293.66, 349.23],  # G7
    ]
    
    chord_len = 4.0 # seconds per chord
    audio = np.zeros_like(t)
    
    # Synthesize electric piano chords with soft envelope
    for i, chord in enumerate(chords * int(duration // (len(chords) * chord_len) + 2)):
        start_time = i * chord_len
        if start_time >= duration:
            break
        end_time = min(start_time + chord_len, duration)
        idx = (t >= start_time) & (t < end_time)
        t_rel = t[idx] - start_time
        
        # ADSR envelope
        env = np.exp(-t_rel * 0.7) * (1 - np.exp(-t_rel * 25))
        
        chord_wave = np.zeros_like(t_rel)
        for freq in chord:
            # fundamental + soft harmonics (Rhodes piano feel)
            chord_wave += 0.5 * np.sin(2 * np.pi * freq * t_rel)
            chord_wave += 0.25 * np.sin(2 * np.pi * freq * 2 * t_rel) * np.exp(-t_rel * 1.5)
            chord_wave += 0.1 * np.sin(2 * np.pi * freq * 3 * t_rel) * np.exp(-t_rel * 2.5)
            
        audio[idx] += chord_wave * env * 0.25
        
    # Add warm vinyl crackle
    crackle = np.random.normal(0, 0.015, len(t))
    # Simple moving average low-pass filter
    kernel_size = 20
    crackle = np.convolve(crackle, np.ones(kernel_size) / kernel_size, mode='same')
        
    audio = audio + crackle * 0.3
    
    # Gentle normalize
    max_val = np.max(np.abs(audio))
    if max_val > 0:
        audio = audio / max_val * 0.7
        
    # Write 16-bit WAV
    int_audio = (audio * 32767).astype(np.int16)
    with wave.open(filename, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(int_audio.tobytes())
        
    print(f'Lo-fi track generated: {filename}')

if __name__ == '__main__':
    generate_lofi_track()
