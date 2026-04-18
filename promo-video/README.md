# Promo Video

## Render the high-quality video

Install dependencies if needed:

```bash
npm install
```

Render the high-quality export:

```bash
npx remotion render MyComp out/brain-garden-scene-high-quality.mp4 --crf=16
```

## Notes

- Composition ID: `MyComp`
- Output file: `out/brain-garden-scene-high-quality.mp4`
- `--crf=16` uses a higher-quality H.264 setting with less compression than the default.

## Open the rendered video

```bash
open out/brain-garden-scene-high-quality.mp4
```
