`record.mjs`, `render-auto-zoom.mjs`, `suggest-zooms.mjs`, and `references/*.md` in this
directory are vendored from the `to-walkthrough-video` skill in
[`akunzai/agent-skills`](https://github.com/akunzai/agent-skills)
(`skills/to-walkthrough-video/`), trialed and adopted per
[`docs/MARKETING/TUTORIAL_VIDEOS/tutorial-video-recorder.ai.mdx`](../../docs/MARKETING/TUTORIAL_VIDEOS/tutorial-video-recorder.ai.mdx)
and its companion POC doc. Vendored rather than kept as an installed skill dependency so this
repo owns maintenance of its own video-recording tooling directly.

Source commit reference at time of vendoring (2026-09-17): `skills-lock.json`'s prior
`to-walkthrough-video` entry, hash `1b4630174a0225c48ae6658b0359a5c8a281663d1f325806e53bc46a31eb53f8`.

MIT License, per the source repository:

```
MIT License

Copyright (c) 2026 Charley Wu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
