# Implementation prompt: Home redesign → real code

Paste below the line into **Claude Code, opened in the `dmico-hub` folder**. Attach the
four approved Home mockups (desktop busy, desktop quiet, mobile busy, mobile quiet).

---

Read `CLAUDE.md`, then `docs/design/DESIGN-BRIEF-hub-redesign.md`, then
`docs/design/dmico-brand-design-context.md` before writing anything.

We have an approved design for the **Home screen** (mockups attached: desktop and mobile,
each in a busy state and a quiet state). Your job is to implement it against the real
files. **Home only.** Do not touch other modules.

## What already exists (do not rebuild it)

- `now.js` already computes the state: `window.dmicoComputeState(sb)` returns
  `{items:[{key, module, text, tone}], nextUp:{title,start,end,remaining}, date}` where
  `tone` is `"lit"` (needs you now) or `"warm"` (waiting). It already merges Jade's alerts
  from kv `jade_alerts`, unlogged mood and reflection, live budget, unseen digests, and the
  next calendar block. It caches for 60s and deduplicates.
- `window.dmicoAttentionMap(sb)` returns `{moduleId: "lit"|"warm"}` for the rail.
- `window.dmicoRefreshRail(sb)` in `app.js` paints the rail dots.
- `dashboard.js` renders Home and already calls `renderNowBlock` into `#dash-now`.
- The rail lives in `app.js` `renderRail()`, with an Archive drawer already built.

So this is mostly **restyling and restructuring existing working code**, not new logic.

## What to build

1. **Home state block** (`now.js` `renderNowBlock`), matching the mockups:
   - Hero: big count plus "things need you", with the secondary "N more can wait" line.
   - `(RIGHT NOW)`, `(NEXT UP)`, `(WAITING)`, `(MODULES)` parenthetical section labels.
   - Numbered `01 / 02 / 03` items with a micro-label line (`NEEDS YOU NOW · FINANCE`),
     a bold statement, a supporting detail line, and an action button on urgent items only.
   - Next Up: `TIME` / `BLOCK` micro-labels on desktop, compact single line on mobile.
2. **The quiet state**, which is the most common state and must feel calm and complete,
   not empty: a check mark, "Nothing needs you", "All modules are quiet", Next Up, and a
   `(CLEARED TODAY)` list. **Derive the module count dynamically, do not hardcode "seven".**
3. **Module strip**: four compact stats (Week, Control, Finance, Exercise). Full cards on
   desktop, a single compact strip on mobile. A module goes orange only when that module
   is actually in an alert state.
4. **Mobile bottom bar** (replaces the rail below the tablet breakpoint): 5 slots, Home /
   Week / Life / Finance / More, custom inline SVG line icons, **no emoji**. Each slot
   carries a state dot. **More shows the highest state of anything inside it** (Control,
   Curators, Exercise, Archive), so nothing hides in there unnoticed. The rail stays on
   desktop and keeps all 7 modules.
5. **State language, applied everywhere:** neutral is the default and most common,
   amber means waiting, orange means needs you now, and **only orange breathes**.

## The one gap you must handle carefully

`(CLEARED TODAY)` is in the design but **has no backend yet**. Nothing currently records an
item transitioning from needing-attention to resolved.

For v1, implement ONLY what is derivable from existing data, and design the function so more
can be added later:
- "Mood logged" plus its timestamp, from kv `mood_data` entries for today.
- "Reflection written", from kv `reflections_data.daily[today]`.
- Anything else in the mockup ("spending back inside the limit", "3 picks read, 1 archived")
  requires state we do not store. **Do not fake it and do not invent a data source.** Leave
  a clearly commented extension point and tell me what would need to be tracked.

If that leaves the cleared list thin on some days, show only what is true. An honest short
list beats an invented long one.

## Constraints

- No build step, no framework, no npm. Plain JS in the existing file structure.
- Use the CSS variables already in `styles.css`. Add new ones only if genuinely needed,
  and say which you added and why.
- Relative paths only.
- Motion: Home may animate, under 300ms, ease-out, wrapped in `prefers-reduced-motion`.
  Only urgent items breathe. Nothing may delay input.
- Complete files, I push via GitHub Desktop.

## Process

1. Read the files you are about to change before changing them.
2. Implement.
3. `node --check` every file you touched.
4. Then **critique your own output**: list five things a senior product designer would
   criticise about the rendered result, then fix the top two.
5. Tell me exactly what you verified and what you could not verify without running it in a
   browser. Do not claim it works because it compiles.
