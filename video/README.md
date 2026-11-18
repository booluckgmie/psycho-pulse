# Psychometric-Pulse explainer video

`out/psychometric-pulse.mp4`: 1920x1080, 30 fps, about 1:44, English narration, brand colours, synthesized music and sound effects.

## Rebuild
```bash
pip install piper-tts numpy                       # local neural TTS
# download an open-source Piper voice (en_US-amy-medium) and point PIPER_VOICE at the .onnx
python3 video/build_audio.py                       # narration -> timeline.js + mixed audio (build/mix.wav)
node video/capture_site.js https://psycho-pulse.vercel.app/ video/assets   # real dashboard stills (sample data)
node video/render_frames.js 0 101.2 30 video/build/frames 4                # deterministic frame render
ffmpeg -framerate 30 -i video/build/frames/f%05d.jpg -i video/build/mix.wav \
  -vf "tpad=stop_mode=clone:stop_duration=3,format=yuv420p" -af loudnorm=I=-16:TP=-1.5:LRA=11 \
  -c:v libx264 -crf 18 -c:a aac -b:a 192k -movflags +faststart -shortest video/out/psychometric-pulse.mp4
```
Scene lengths come from the narration, so editing the script in `build_audio.py` re-times everything.

## Notes
- Every frame is a pure function of time (`scenes.html`), so renders are reproducible.
- The 99% / 17% figures in scene 3 come from `data/evaluation.csv` (synthetic data; weekly vs once-a-term, found before the crisis point). They are labelled as simulation on screen.
- Dashboard stills use the built-in sample data with anonymous IDs only.
- Narration is English only; Malay appears as on-screen text and the closing tagline.
