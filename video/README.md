# Psychometric-Pulse explainer video

`out/psychometric-pulse.mp4`: 1920x1080, 30 fps, about 1:44, **music only (no narration)**, brand colours, burned-in English captions. Music and sound effects are composed in code.

## Rebuild
```bash
pip install piper-tts numpy                       # local neural TTS
# download an open-source Piper voice (en_US-amy-medium) and point PIPER_VOICE at the .onnx
python3 video/build_audio.py                       # reads the script with TTS only to time the scenes -> timeline.js (its narration track is NOT used)
python3 video/build_music.py                       # composes the music-only soundtrack -> build/music_mix.wav
node video/capture_site.js https://psycho-pulse.vercel.app/ video/assets   # real dashboard stills (sample data)
node video/render_frames.js 0 101.2 30 video/build/frames 4                # deterministic frame render
ffmpeg -framerate 30 -i video/build/frames/f%05d.jpg -i video/build/music_mix.wav \
  -vf "tpad=stop_mode=clone:stop_duration=3,format=yuv420p" \
  -af "acompressor=threshold=0.05:ratio=2.5:attack=30:release=300:makeup=2,loudnorm=I=-15:TP=-1.5:LRA=7" \
  -c:v libx264 -crf 18 -c:a aac -b:a 192k -movflags +faststart -shortest video/out/psychometric-pulse.mp4
```
Scene lengths come from the narration, so editing the script in `build_audio.py` re-times everything.

## Notes
- Every frame is a pure function of time (`scenes.html`), so renders are reproducible.
- The 99% / 17% figures in scene 3 come from `data/evaluation.csv` (synthetic data; weekly vs once-a-term, found before the crisis point). They are labelled as simulation on screen.
- Dashboard stills use the built-in sample data with anonymous IDs only.
- Scene lengths still follow the script's reading time so the captions stay readable. Edit the script in `build_audio.py` to re-time.
- Music: D major, 120 bpm grid locked to the on-screen heartbeat (the heartbeat thump is the kick). Sparse piano in the intro, groove from the weekly check-in, tension in the teacher-transfer scene, melody from the 'adjusted' scene, calmer for privacy, full lift on the end card.
- Malay appears as on-screen text and the closing tagline.
