# Effects: pointer, captions, zoom, pacing

Three things are drawn on top of the real page. All three are on by default,
and `effects` in `scenario.json` turns any of them off:

```json
{ "effects": { "zoom": false, "cursor": true, "captions": true } }
```

Only these three keys are accepted, only booleans, and a key you leave out
keeps its default. A typo is refused before a browser opens rather than
silently ignored.

| Effect | On | Off |
| --- | --- | --- |
| `cursor` | An arrow travels to each target, swaps to a hand or text-input icon while resting on it, and a click or double-click leaves a fading blue ring | No arrow, and the mouse moves straight to its target instead of sweeping hover states along a path nobody can see |
| `captions` | A caption names each interaction while it happens | Nothing is drawn |
| `zoom` | ffmpeg zooms into each click cluster | No zoom is applied. A `.webm` output is the raw capture; any other container is still re-encoded by ffmpeg. `.clicks.jsonl` and `.zooms.json` are written either way |

Turning `zoom` off does not throw the zoom data away, so you can record once
and decide later:

```bash
node scripts/render-auto-zoom.mjs --video demo.webm --clicks demo.clicks.jsonl --out zoomed.mp4
```

## Pointer

The icon is read off the step's own `action`, not sniffed live from the page:
`click`, `dblclick` and `select` show a hand; `type` shows a text-input
caret; `press` and everything else leave the arrow alone. The swap only
happens once the pointer is resting on that step's target, and it reverts
to the arrow as soon as the pointer starts moving to the next one.

A `click` leaves one fading ring at the click point; a `dblclick` leaves
two, about 150ms apart, so a double-click reads as one on screen. `type`
and `select` still perform a real click to focus the target, but that
click leaves no ring — only `click` and `dblclick` do.

The pointer, rings and captions are scripts injected into the page. Sites
with a strict Content Security Policy (Trusted Types, as on YouTube) refuse
them, so the recorder turns the page's CSP off for its own browser
(`bypassCSP`, on by default). A scenario can set `"bypassCSP": false` to
record under the page's real policy, at the cost of the pointer on such
sites.

## Captions

Captions are drawn on the page itself, and this repo keeps them off. The text a viewer reads is the
presentation's [narration](./narration.md) instead, so nothing below is needed for a normal flow.

Every interaction step is captioned: `click`, `dblclick`, `type`, `select`
and `press`. `wait` and `goto` are not. The caption holds for the whole step,
so an instant keypress still stays on screen long enough to read. It appears
once the pointer reaches the target, before the click, and a step that loads
another page removes it then, rather than leaving it over the page it lands on.

A caption sits just under the element the step acts on, not at the bottom of
the page. Auto-zoom crops a 1.5x window around the click, and a caption pinned
to the bottom edge falls outside that crop exactly when the viewer is looking
hardest. A step with no element — `press` — centres its caption instead.

A long caption wraps rather than running off the edge: it is at most 720px
wide, or the viewport less a 16px gutter each side on a phone, and it moves
toward the centre as far as that width needs. A narrow viewport also gets a
smaller font.

Only you know what a click opens, so a step can move its caption out of the
way with `captionPlacement`. The default, `auto`, puts the caption under the
target, or above it near the bottom edge. `above` and `below` force a side,
and `bottom` centres it at the foot of the viewport. A menu that drops down
under its toggle is the usual reason:

```json
{ "action": "click", "role": "button", "name": "Menu", "captionPlacement": "bottom" }
```

`above` is not moved back on screen for a target near the top edge. Use
`bottom` there instead. `bottom` lies outside the auto-zoom crop unless the
target is itself near the bottom, so the caption shows only while the view is
not zoomed in.

The wording is generated from the step — a verb plus what it acts on, types,
or presses. `captionLocale` picks the wording. English, Traditional Chinese (`zh-TW`) and
Japanese (`ja`) ship; anything else falls back to English. Each locale carries
a template rather than a verb, because word order differs: `Click Save`,
`點擊 Save`, `Save をクリック`. **Set it to the language
of the conversation that asked for the recording**: a script cannot know who
the video is for, so the agent writing `scenario.json` decides.

Any step can replace its generated caption:

```json
{ "action": "press", "keys": "Control+k", "caption": "按下 Ctrl + K 開啟搜尋" }
```

A combination key is rendered as key symbols rather than Playwright's syntax:
`Meta+Shift+p` reads as `⌘ + ⇧ + P`.

## Zoom

All zoom and glide rules, options and defaults live in [`zoom.md`](./zoom.md). The `zoom` effect
above only turns them on or off for a scenario.

## Pacing

Every interaction has a cursor move, a beat on the target before the click, and a pause after it.
Each is a step option, and the scenario can set a default for all steps:

| Option | Default | What it times |
| --- | --- | --- |
| `moveDurationMs` | 300 | Cursor travel to the target |
| `preClickMs` | 300 | Resting on the target before the click (with zoom on) |
| `pause` | scenario `pauseMs`, else 2500 | Holding after the step |
| `typeDelay` | scenario `typeDelayMs`, else 90 | Milliseconds per typed character |

Pace by what the viewer needs to read. A step that shows something worth reading (a URL, a name, a
result) keeps the defaults or goes slower. A step that only fills a field nobody needs to read
(sizes, filler values) goes fast: about `typeDelay` 30, `moveDurationMs` 150, `preClickMs` 60 and
`pause` 100. Typing takes `typeDelay` × characters plus ~1.5ms per character, so a long string needs
a small `typeDelay` (13 for a 43-character URL is about 600ms); recompute it when the text changes.
A `wait` step is dead air, so make it the shortest the page needs: the next click already waits
for its target to appear. The gap between two clicks is the wait plus a fixed cost around each click
(about 1s of zoom-out and pause after one, about 0.6s of cursor move and rest before the next), so
measure the gap in the click log before deciding how much to cut.
In a side-by-side flow any pacing change shifts the later beats, so recheck the sync waits
([`zoom.md`](./zoom.md#procedure), step 5).

## The `press` step

```json
{ "action": "press", "keys": "Control+k" }
```

It takes no locator, because a shortcut acts on the page rather than an
element. Keys use Playwright's own syntax — `Control+k`, `Meta+Shift+P`,
`Enter`, `Escape`.

This is the step whose effect the screen may not show at all, which is why
captions matter most here.

## What a recording cannot show

Playwright never runs an input method editor. Typing CJK text sends the
characters straight into the field: four `insertText` events for 你好世界, no
key presses and no composition. The candidate window a real user would see
never appears, and the text simply materialises. A caption is the only thing
that explains where it came from.

## Why Playwright 1.59

Capture runs through `page.screencast`, added in 1.59, rather than the
context-level `recordVideo`. Recording therefore starts where the walkthrough
starts instead of when the page is created, so no preamble has to be trimmed
back off, and the same call works on a page that already exists. Captions use
`screencast.showOverlay` from the same release.

`record.mjs` says so plainly when the installed Playwright is older, rather
than failing somewhere deep.
