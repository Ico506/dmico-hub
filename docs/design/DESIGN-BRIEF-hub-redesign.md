# Design Brief: DMICO Hub redesign (control room, not dashboard)

Status: DRAFT for Damico sign-off
Scope: `dmico-hub` visual layer only. No feature changes.
Prerequisite: the consolidation PRD ships first (7 visible modules, not 14).
Last updated: 2026-08-25

---

## 1. The actual design problem

The hub is not ugly. It is **flat**. Every card, every module, every number carries the
same visual weight, so a screen where everything is fine looks identical to a screen
where you are RM200 over budget and have missed your anchor twice. That is the real
failure, and no amount of prettier cards fixes it.

So the brief is not "make it look nicer." It is:

> **Make the hub show the state of Damico's life at a glance, so that what needs him
> is visually louder than what does not.**

A control room, not a dashboard. Dashboards display data. Control rooms show state and
invite action.

## 2. The feeling

A warm, quiet workshop desk at dusk. Paper, ink, and one lit lantern. Muji restraint
(nothing decorative that isn't doing a job) with a Ghibli warmth (hand-made, lived-in,
never sterile). Calm by default, with the ability to raise its voice in exactly one
colour when something matters.

Adjectives to design toward: calm, warm, tactile, legible, quietly alive.
Adjectives to design away from: corporate, techy, neon, glassy, busy, clinical.

## 3. Non-negotiables (already decided, do not re-litigate)

The palette, type, and lantern metaphor are locked and come from
`skills-to-learn-Claude/dmico-brand-design-context.md`:

```css
--paper:#F4EBD2; --paper-deep:#EADCBD; --surface:#FEFAE0; --surface-2:#FFFDF4;
--ink:#45301E; --ink-soft:#7C6A4F; --ink-faint:#A89A7C; --line:#E3D7BA;
--accent:#5F6F52;      /* olive, actions */
--lantern:#C4661F;     /* alloy orange, THE signal colour */
--clay:#8A3F1E;        /* danger */  --amber:#B08A2A;
--radius:14px; --radius-lg:22px; --radius-pill:999px;
--display:"Zen Maru Gothic"; --body:"Zen Kaku Gothic New";
```

- **Light, warm, paper.** Never a dark theme.
- **Saturation is a budget.** Olive and alloy-orange are spent only on actions and
  live signals. If everything glows, nothing does.
- **The lantern rail is the signature.** Protect it. Lit means ready, dim means archived.
- **Mobile-first, Android Chrome is the test target.** It is an installed PWA.

## 4. The anti-slop list (explicit, enforceable)

The redesign must NEVER produce:
1. Purple or blue-violet gradients of any kind.
2. Glassmorphism, frosted blur panels, or neon "AI glow" edges.
3. Inter, Poppins, or a default system stack presented as a design choice.
4. Emoji used as section headers or as a substitute for icons.
5. A centered hero with a big CTA. This is an app behind a login, not a landing page.
6. Dark mode, or a dark "pro" variant.
7. Uniform card grids where a critical number and a decorative stat look identical.
8. Stock vector illustrations (unDraw and friends).
9. Fake or placeholder data in any built screen. Real data or a real empty state.
10. Decorative motion. Motion must communicate state change or it does not ship.

## 5. Reference set (three refs, three different jobs)

Deliberately three, each doing ONE job, so the result is not a collage.

| Job | Reference | What we take | What we ignore |
|---|---|---|---|
| **Structure / flows** | [Mobbin](https://mobbin.com) — real shipped app screens and full flows | How real products lay out a home/overview, empty states, and settings. Where actions sit on mobile. | Their colours and brands entirely |
| **Craft / restraint** | [SiteInspire](https://siteinspire.com) and [Godly](https://godly.website) | Typographic rhythm, generous spacing, how a single accent colour carries a whole page | Heavy scroll-jacking and experimental animation. Wrong for a daily tool |
| **Component patterns** | [Land-book](https://land-book.com) | Section-level solutions when one block is stuck (a summary row, a list, a stat cluster) | Whole-page copying |

Deliberately excluded: Dribbble as a primary reference. It shows idealised concept
shots without empty states, edge cases, or real data density, which is exactly how a
design ends up looking good in a screenshot and terrible in use.

Non-web references that fit the brand better than most websites: Muji packaging and
in-store signage (restraint, tiny type, huge whitespace), Japanese stationery and
notebook design, and analogue instrument panels (a control room shows state with
position and one colour, not with labels everywhere).

## 6. What actually changes (screen by screen)

1. **Home becomes the state view.** One "right now" block at the top answering: what is
   left today, what is unlogged, what is over budget, what Jade flagged. Everything
   else demotes below it. This is the screen the whole redesign is judged on.
2. **The rail gets a state language.** A lantern is dim (nothing), warm (something
   waiting), or lit (needs you now). Three states, one colour, no badges everywhere.
3. **Typographic hierarchy replaces card borders.** Right now boxes separate things.
   Use size, weight, and space instead so the page breathes and the important number
   is genuinely the biggest thing.
4. **One number per screen is the hero.** Finance: money left this month. Life: today's
   mood and whether the reflection is done. Week: what is next.
5. **Empty states become invitations**, using the honest goal-gradient copy already
   introduced (what you have set up, what happens next).

## 7. Process (how we will actually build it)

1. **Tokens first.** Lock spacing scale, type scale, and the three lantern states as
   CSS variables before any screen is touched.
2. **One screen to done.** Home only. Iterate until genuinely good.
3. **Screenshot and critique loop.** Render, look at it, name what is wrong in words,
   fix. Repeat. This loop is most of the quality.
4. **Propagate.** Apply the settled language to the other six modules.
5. **Verify on device.** Android Chrome, installed PWA, real data.

Success test: open the hub on a normal morning and know within three seconds whether
anything needs you, without reading a single label.

## 8. Open questions — RESOLVED (Damico, 2026-08-25)

### 8.1 Navigation: bottom bar on mobile
Confirmed. Mobile gets a thumb-reachable bottom bar; the lantern rail stays on desktop
at wider breakpoints.

**Constraint flagged:** a bottom bar holds four or five items before it becomes
cramped and unreadable on a phone. We have seven visible modules. Cramming seven in
would produce tiny, mistappable targets, which defeats the point of moving it down.

**Resolution (assumption, correct me if wrong):** four permanent slots chosen on the
usage evidence, plus a fifth "More" slot that opens a sheet containing the rest and
the Archive drawer.

| Slot | Module | Why |
|---|---|---|
| 1 | Home | The state view, the reason to open the app |
| 2 | Week | Calendar written daily |
| 3 | Life | Mood + reflection, logged daily |
| 4 | Finance | 70 expenses, the single most-used module |
| 5 | More | Sheet: Curators, Exercise, Control, then Archive |

The lantern metaphor survives the move: bar items still carry the dim / warm / lit
state language, so the bar itself becomes the at-a-glance signal on mobile.

### 8.2 Motion policy: alive at the overview, still at the work
Confirmed, and it becomes a rule rather than a preference:

> **Motion belongs where you are orienting and choosing. Stillness belongs where you
> are concentrating.**

- **Home and navigation (motion allowed, and encouraged):** lanterns can breathe or
  warm up, the state block can settle in on load, tab transitions can have character,
  a state change (budget crossing a threshold, a digest landing) can announce itself.
  This is where the hub earns the word "lively."
- **Inside a module (still):** no entrance animation on lists, no hover flourishes on
  rows, no animated numbers while you are reading or logging. Data does not dance.
- **Always exempt:** anything that would delay input. Logging an expense must feel
  instant, never staged.
- **Budget:** overview motion stays under 300ms, uses ease-out, and respects
  `prefers-reduced-motion`.

This supersedes anti-slop item 10 for the Home screen only: decorative motion is
allowed at the overview layer, because there its job is to make the hub feel alive.
Everywhere else, item 10 stands.
