# Changelog

## 0.1.8

### Zoom renderer

- Ease-out quadratic zoom-in (replaces cosine) so motion does not read as frozen frames then a rush.
- Crop center tracks zoom toward `zoomFocus` (fixes edge-pin kink on off-center foci).
- Frame-aligned segment cuts (`frameAlignMs`) and `fps=` on plain segments before concat (smoother first zoom after heavy UI).
- `record.mjs`: capture timeline aligned to delivery FPS for zoom start.

### Delivery

- Default delivery FPS **30 → 60** for short UI motion (e.g. stinger transitions).

### Docs

- Expanded `tooling/references/zoom.md` (pipeline, first stretch, troubleshooting, fixed foci).
- `tooling/README.mdx`, `references/effects.md`, create/record-flow skills updated.
- Install scaffold `.appreel/README.md` and package README point at zoom reference.
