# MUSTREAD — DMICO Brand & Design Context (for any new chat)

**Purpose:** paste-free context transfer. Point a new Claude chat at this file when working on anything DMICO-branded (DMICOckpit, web-app portfolio tools, hub-adjacent UI). Last updated 8 July 2026.

---

## 1. Identities (never mix these up)

**DMICO** = personal brand, build-in-public channel, all solo creator work. **JadeFrog Studio** = studio identity, kept separate. Default banner for new personal tools is DMICO; flag banner choice at naming time per standing decision. Owner is Damico: Malaysian game designer/researcher, MPhil (AR/VR + Game Studies) at APU, ~6 yrs Unity/C#, based in Sibu, Sarawak.

## 2. The three creator personas (decided 8 July 2026)

1. **Vibe Coding / AI** (new account): AI tech news + vibe-coded builds. Tier A, primary. Carries the Gaji Decoder launch.
2. **Game Dev** (existing, being reactivated): game news, playing, making, talking games. Tier B. Banner: DMICO for now, editable (solo-brand run).
3. **Life / Creatives** (new account): Tier C, pressure-free.

Platforms: Xiaohongshu + Instagram. XHS notes are written in Mandarin (Damico is Malaysian Chinese and writes it himself). IG voice is BM/EN Manglish. Persona settings (handles, platform toggles, banner, tier) must always be editable in-app, never hard-coded.

## 3. Ecosystem map (what exists, where)

- **dmico-hub** (GitHub repo): the personal hub PWA. Lantern-rail navigation UI, module tabs (Finance, Life, Control, Groceries...), Supabase `kv_store` backend, installable PWA. THE visual reference for DMICO tools.
- **jadefrog-scheduler** (GitHub repo): Discord bot on Railway, shares the hub's Supabase.
- **PRD_Claude folder structure:** `dmico-hub_PRD/` (hub + bot PRDs), `dmico-webapp-PRD/` (portfolio tools: Gaji Decoder etc. + strategy backlog), `dmico-content-cockpit/` (DMICOckpit research + PRD), `MUSTREAD-NEWCHAT/` (this file + the reusable PWA-installable prompt).

## 4. DMICO-HUB color template — SOURCE OF TRUTH

Pulled from the live dmico-hub repo (`styles.css` `:root`, 8 July 2026). This is the REAL palette; use these tokens verbatim in any DMICO-branded UI.

```css
:root {
  --paper: #F4EBD2;        /* page background (cornsilk) */
  --paper-deep: #EADCBD;   /* wells / recessed areas */
  --surface: #FEFAE0;      /* cards / panels */
  --surface-2: #FFFDF4;    /* raised / inset surfaces */
  --ink: #45301E;          /* main text (deep brown) */
  --ink-soft: #7C6A4F;     /* secondary text */
  --ink-faint: #A89A7C;    /* faint text */
  --line: #E3D7BA;         /* borders */

  --accent: #5F6F52;       /* olive green: actions */
  --accent-deep: #4B5840;  /* hover / ok */
  --accent-wash: rgba(95, 111, 82, 0.14);

  --lantern: #C4661F;      /* alloy orange: live / warn / signature glow */
  --lantern-glow: rgba(196, 102, 31, 0.38);

  --clay: #8A3F1E;         /* danger */
  --amber: #B08A2A;        /* the "yellow" dashboard tone */

  --radius: 14px; --radius-lg: 22px; --radius-pill: 999px;
  --shadow: 0 1px 2px rgba(69, 48, 30, 0.05), 0 8px 24px rgba(69, 48, 30, 0.07);

  --display: "Zen Maru Gothic", system-ui, sans-serif;
  --body: "Zen Kaku Gothic New", system-ui, sans-serif;
}
```

Extended swatch set Damico uses alongside: laurel green #A9B388, lemon meringue #F9EBC7, camel #B99470, russet #783D19. Fonts load from Google Fonts (Zen Maru Gothic 400/500/700 + Zen Kaku Gothic New 400/500/700).

## 5. Design language notes (from hub PRDs)

NOT a dark theme. The hub's own words: "warm earthy. Cornsilk paper, deep-brown ink, olive-green accent, alloy-orange lantern glow. The saturated tones are spent only on actions and the lantern so the cream stays calm rather than muddy." Signature: modules are paper lanterns, lit = ready, unlit = not yet. Rounded display type (Zen Maru Gothic) + clean body (Zen Kaku Gothic New). Inline SVG charts, reuse-existing-patterns culture. Mobile-first, installable (see `make-website-installable-prompt.md` in this folder: manifest + relative `./` paths + network-first minimal service worker + 192/512/maskable icons). Damico's phone is **Android**, so Android Chrome is the primary test target.

## 6. Working rules that apply to every build

Complete files, no partial snippets (GitHub Desktop push workflow). RM0 infra for experimental tools; static + localStorage preferred; spend requires sign-off. Research doc → Damico sign-off → PRD → build, every time. No em dashes in any copy. BM-first with EN where the audience is Malaysian young adults; Mandarin for XHS. AI features are parked by default (API cost vs viral-free economics). Kill/iterate review at day 60.

## 7. Active project pointers

- **DMICOckpit** (current): `dmico-content-cockpit/PRD-dmicockpit.md`. Multi-persona content pipeline PWA. Read the research doc beside it for XHS/IG platform rules before touching content features.
- **Gaji Decoder** (Cluster A #1): `dmico-webapp-PRD/PRD-gaji-decoder-cluster-a.md`, strategy in `BACKLOG-dmico-webapp-portfolio.md`.
