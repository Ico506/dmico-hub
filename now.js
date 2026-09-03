/* ─────────────────────────────────────────────────────────────
   dmico life os — the "right now" state engine
   One shared computation of what is currently true, used by:
     - the Home state block (renderNowBlock)
     - the lantern rail attention markers (dmicoAttentionMap)
     - the mobile bottom bar (app.js)
   so every surface agrees. Jade's own alerts (kv 'jade_alerts', written by
   jade_events.py on the bot) feed straight in, which is what keeps Discord and
   the hub telling the same story.

   Tone language, three levels only, matching the lantern metaphor:
     lit   = needs you now      (alloy orange, the signature signal colour)
     warm  = waiting, not urgent (amber)
     calm  = nothing to do
   ───────────────────────────────────────────────────────────── */

(function () {

  // ── The one spend rule ─────────────────────────────────────
  // Every surface that compares spending against monthly_budget must use this, or it
  // will drift. It already drifted eight ways: finance.js, now.js, dashboard.js and
  // five services in the bot each carried their own copy, and on 3 Sep 2026 Home said
  // "over by RM209" while Finance said "RM38.55 of RM979.70".
  //
  // Two exclusions. A category bucketed "fixed" is a commitment, and monthly_budget has
  // meant the STEERABLE limit since 1 Sep 2026, so commitments sit outside it. A row
  // dated later than today has not been paid, so it is scheduled, not spent.
  window.dmicoSteerableSpend = function (expRows, buckets, ref) {
    const d = ref || new Date();
    const endOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    const map = buckets || {};
    return (expRows || []).reduce((sum, e) => {
      const x = new Date(e.logged_at);
      if (x.getFullYear() !== d.getFullYear() || x.getMonth() !== d.getMonth()) return sum;
      if (x > endOfToday) return sum;
      if (map[(e.category || "").trim().toLowerCase()] === "fixed") return sum;
      return sum + Number(e.amount || 0);
    }, 0);
  };

  let _cache = null;
  let _cacheAt = 0;
  const CACHE_MS = 60000;
  // Remembered so a background refresh can re-query without the caller passing it.
  let _lastSb = null;

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const rm = (n) => "RM " + Number(n || 0).toLocaleString(undefined,
    { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const hhmm = (d) => {
    d = d || new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const weekdayName = (iso) => {
    try { return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "long" }); }
    catch (e) { return iso; }
  };
  const daysBetween = (isoA, isoB) =>
    Math.round((new Date(isoB + "T00:00:00") - new Date(isoA + "T00:00:00")) / 86400000);

  /* ── the computation ──────────────────────────────────────── */

  async function computeState(sb) {
    const now = Date.now();
    if (sb) _lastSb = sb;
    if (_cache && now - _cacheAt < CACHE_MS) return _cache;

    const t = todayISO();
    const items = [];   // things that want attention (tone: lit | warm)
    const cleared = []; // things resolved today, for the quiet-state list
    let nextUp = null;  // the next thing on today's calendar
    let thenUp = null;  // the one after that

    const [alerts, mood, refl, digest, seenBlob, week] = await Promise.all([
      window.dmicoKvGet("jade_alerts"),
      window.dmicoKvGet("mood_data"),
      window.dmicoKvGet("reflections_data"),
      window.dmicoKvGet("curator_digest"),
      window.dmicoKvGet("hub_last_seen"),
      window.dmicoKvGet("week_calendar"),
    ]);

    // 1. Jade's alerts, but ONLY for things this file cannot check itself.
    //
    //    kv 'jade_alerts' is a LOG OF EVENTS THAT FIRED, not live state. Once Jade
    //    posts "reflection not logged" at 21:00, that entry sits in kv for the rest
    //    of the day, so replaying it verbatim kept showing resolved items forever.
    //    Anything computed below (mood, reflection, budget, digests) is read live
    //    from source every time, so the LOCAL check is the truth and Jade's copy is
    //    ignored. She only fills the gaps for rules the hub has no local equivalent
    //    of, and even those are re-validated where possible.
    const LOCALLY_CHECKED = new Set([
      "mood_missing", "reflection_missing",
      "budget_80", "budget_100", "digest_landed",
    ]);
    const aItems = (alerts && Array.isArray(alerts.items)) ? alerts.items : [];
    aItems
      .filter((a) => String(a.ts || "").slice(0, 10) === t)
      .filter((a) => !LOCALLY_CHECKED.has(a.rule))
      .forEach((a) => {
        items.push({
          key: `jade:${a.rule}`,   // keyed by rule, so a repeat fire cannot duplicate
          module: moduleFromUrl(a.url),
          text: a.text,
          tone: "lit",
          cta: "Open",
          source: "jade",
        });
      });

    // 2. Today's logging: mood and reflection. Warm during the day, lit after 21:00,
    //    because before evening an unlogged reflection is simply not due yet.
    const late = new Date().getHours() >= 21;
    const moodEntries = (mood && mood.entries) || [];
    const todaysMood = moodEntries.find((e) => e.date === t);
    const reflDaily = (refl && refl.daily) || {};
    const todaysRefl = reflDaily[t];

    if (!todaysMood) {
      const lastMood = moodEntries.filter((e) => e.date < t)
        .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      const gap = lastMood ? daysBetween(lastMood.date, t) : null;
      items.push({
        key: "mood", module: "life", text: "Mood not logged today",
        tone: late ? "lit" : "warm", cta: "Log mood",
        detail: gap == null ? null
          : gap <= 6 ? `Last logged ${weekdayName(lastMood.date)} · ${gap}-day gap`
          : `Last logged ${gap} days ago`,
      });
    } else {
      // The bot timestamp is a formatted string ("26 Aug 2026, 08:20 AM"); pull just
      // the clock part for the cleared-today list.
      const m = String(todaysMood.timestamp || "").match(/\d{1,2}:\d{2}\s?[AP]M/i);
      const moodDetail = todaysMood.word
        ? `${todaysMood.word}, ${todaysMood.rating} of 5`
        : todaysMood.rating != null ? `${todaysMood.rating} of 5` : null;
      cleared.push({ key: "mood", module: "life", text: "Mood logged", detail: moodDetail, time: m ? m[0] : null });
    }

    if (!todaysRefl || !todaysRefl.completed) {
      items.push({
        key: "reflect", module: "life", text: "Reflection not written yet",
        tone: late ? "lit" : "warm", cta: "Write reflection",
      });
    } else {
      let time = null;
      try { time = new Date(todaysRefl.completed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
      catch (e) { /* leave time unset if the timestamp is unparsable */ }
      cleared.push({ key: "reflect", module: "life", text: "Reflection written", time });
    }

    // 3. Money. Read live so it is never a stale snapshot.
    try {
      if (sb) {
        const [{ data: setRows }, { data: expRows }] = await Promise.all([
          sb.from("finance_settings").select("monthly_budget, category_buckets").limit(1),
          sb.from("finance_expenses").select("amount, logged_at, category"),
        ]);
        const budget = Number(setRows?.[0]?.monthly_budget || 0);
        const spend  = window.dmicoSteerableSpend(expRows, setRows?.[0]?.category_buckets);
        if (budget > 0) {
          const left = budget - spend;
          const pct = (spend / budget) * 100;
          if (pct >= 100) {
            items.push({ key: "budget", module: "finance", tone: "lit", cta: "Review",
              text: `Over your spending limit by ${rm(Math.abs(left))}`,
              detail: `${rm(spend)} spent of ${rm(budget)}` });
          } else if (pct >= 80) {
            items.push({ key: "budget", module: "finance", tone: "warm", cta: "Review",
              text: `${rm(left)} left of this month's limit`,
              detail: `${rm(spend)} spent of ${rm(budget)}` });
          } else {
            cleared.push({ key: "budget", module: "finance", text: "Spending inside the limit",
              detail: `${rm(spend)} of ${rm(budget)}`, time: null });
          }
        }
      }
    } catch (e) { console.error("now: finance read failed", e); }

    // 4. Unseen curator digests.
    const seen = (seenBlob && seenBlob.seen) || {};
    ["content", "research", "markets"].forEach((dom) => {
      const dg = digest && digest[dom];
      if (dg && dg.date === t && (dg.items || []).length) {
        if (!seen[`${dom}:${t}`]) {
          items.push({ key: `digest:${dom}`, module: "curators", tone: "warm", cta: "View",
            text: `${dg.items.length} new ${dom} pick${dg.items.length === 1 ? "" : "s"}`,
            detail: "New since your last visit" });
        }
      }
    });

    // 5. What is next (and after that) on the calendar today (calm, not an alert).
    const evs = (week && Array.isArray(week.events)) ? week.events : [];
    const nowHM = hhmm();
    const todaysLeft = evs
      .filter((e) => e.date === t && !e.allDay && (e.end || "") > nowHM)
      .sort((a, b) => String(a.start).localeCompare(String(b.start)));
    if (todaysLeft.length) {
      const n = todaysLeft[0];
      nextUp = { title: n.title, start: n.start, end: n.end, remaining: todaysLeft.length };
      if (todaysLeft[1]) thenUp = { title: todaysLeft[1].title, start: todaysLeft[1].start };
    }

    // Deduplicate by key. The old version dropped the LOCAL item whenever Jade had
    // said something similar, which is exactly backwards: her entry is a historical
    // event and the local one is live. Jade's rules no longer overlap the local
    // checks at all (see LOCALLY_CHECKED above), so this is now just a safety net
    // against the same key being pushed twice.
    const seenKeys = new Set();
    const deduped = items.filter((i) => {
      if (seenKeys.has(i.key)) return false;
      seenKeys.add(i.key);
      return true;
    });

    const order = { lit: 0, warm: 1 };
    deduped.sort((a, b) => (order[a.tone] ?? 2) - (order[b.tone] ?? 2));

    // (CLEARED TODAY) v1 note: mood and reflection are the only things this hub can
    // honestly say were "cleared", because they are the only state that records a
    // done-today timestamp. "Spending back inside the limit" appears above once
    // finance_settings has a budget and the month is under it, since that IS derivable
    // live. Curator digests ("3 picks read, 1 archived") are NOT trackable yet: nothing
    // records when a pick moves from unread to read/archived. To add that, curators.js
    // would need to write a per-item read/archived timestamp back to kv or a table, and
    // this function would read it the same way it reads mood/reflection above.
    _cache = { items: deduped, cleared, nextUp, thenUp, date: t };
    _cacheAt = now;
    return _cache;
  }

  function moduleFromUrl(url) {
    const m = String(url || "").match(/#do=tab:([a-z]+)/i);
    if (m) return m[1];
    if (/#do=(mood|reflect)/i.test(String(url))) return "life";
    if (/#do=weighin/i.test(String(url))) return "exercise";
    return "dashboard";
  }

  window.dmicoComputeState = computeState;
  window.dmicoInvalidateState = () => { _cache = null; };

  /* Re-read state when the hub comes back into view.
     Without this, the screen is a snapshot from whenever it last rendered. Log a
     reflection in Discord, switch back to the hub, and it would still be asking you
     to log it, because nothing told the page to look again. Fires on tab focus and
     on returning to an installed PWA from the background, then repaints Home and
     the rail. Cheap: the 60s cache still absorbs rapid switching. */
  let _refreshing = false;
  async function refreshNow() {
    if (_refreshing || document.hidden) return;
    _refreshing = true;
    try {
      _cache = null;
      const host = document.getElementById("dash-now");
      if (host && window.renderNowBlock) await window.renderNowBlock(host, _lastSb);
      if (window.dmicoRefreshRail) await window.dmicoRefreshRail(_lastSb);
      // The banner reads the same state, so it refreshes with everything else.
      if (window.dmicoRenderNudge) await window.dmicoRenderNudge(_lastSb);
    } catch (e) {
      console.error("state refresh failed", e);
    } finally {
      _refreshing = false;
    }
  }
  window.dmicoRefreshState = refreshNow;

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshNow();
  });
  window.addEventListener("focus", refreshNow);
  // Slow poll while the hub is actually open and visible, so a long session does
  // not drift. Five minutes is well under the pace anything here changes.
  setInterval(() => { if (!document.hidden) refreshNow(); }, 300000);

  /* ── the rail / bottom-bar attention map ──────────────────── */

  window.dmicoAttentionMap = async function (sb) {
    try {
      const st = await computeState(sb);
      const map = {};
      st.items.forEach((i) => {
        if (!i.module) return;
        if (map[i.module] !== "lit") map[i.module] = i.tone;
      });
      return map;
    } catch (e) { console.error("attention map failed", e); return {}; }
  };

  /* ── the Home state block ─────────────────────────────────── */

  function injectStyles() {
    if (document.getElementById("now-styles")) return;
    const s = document.createElement("style");
    s.id = "now-styles";
    s.textContent = `
      .now-block{margin:0 0 1.4rem;}
      .now-top{display:flex;align-items:baseline;justify-content:space-between;gap:12px;
        margin-bottom:26px;flex-wrap:wrap;}
      .now-eyebrow{font-size:0.62rem;letter-spacing:0.16em;text-transform:uppercase;
        color:var(--ink-soft,#7C6A4F);font-weight:700;}
      .now-date{font-size:12.5px;color:var(--ink-faint,#A89A7C);}

      .now-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));
        gap:32px 52px;align-items:start;}

      /* hero */
      .now-hero{display:flex;align-items:center;gap:16px;animation:now-rise .42s ease-out both;}
      .now-hero.quiet .now-hero-check{width:56px;height:56px;border-radius:50%;
        border:1.5px solid var(--line,#E3D7BA);display:flex;align-items:center;
        justify-content:center;flex-shrink:0;}
      .now-hero-num{font-family:var(--display,inherit);font-weight:700;font-size:88px;
        line-height:0.82;color:var(--lantern,#C4661F);letter-spacing:-0.02em;flex-shrink:0;}
      .now-hero-body{min-width:0;}
      .now-hero-title{font-family:var(--display,inherit);font-size:26px;font-weight:700;
        line-height:1.15;color:var(--ink,#45301E);margin:0;}
      .now-hero-sub{font-size:13px;color:var(--ink-soft,#7C6A4F);margin:5px 0 0;}

      /* next up */
      .now-nextup{margin-top:24px;padding-top:22px;border-top:1px solid var(--line,#E3D7BA);}
      .now-nextup-row{display:grid;grid-template-columns:62px 1fr;gap:0 14px;}
      .now-nextup-row + .now-nextup-row{margin-top:14px;}
      .now-nextup-label{font-size:0.56rem;letter-spacing:0.14em;text-transform:uppercase;
        color:var(--ink-faint,#A89A7C);font-weight:700;}
      .now-nextup-time{font-family:var(--display,inherit);font-size:18px;font-weight:700;
        color:var(--ink,#45301E);margin-top:3px;}
      .now-nextup-time.then{font-size:15px;color:var(--ink-soft,#7C6A4F);}
      .now-nextup-title{font-size:15px;color:var(--ink,#45301E);margin-top:4px;font-weight:500;}
      .now-nextup-detail{font-size:12.5px;color:var(--ink-faint,#A89A7C);margin-top:2px;}
      .now-nextup-empty{font-size:13px;color:var(--ink-faint,#A89A7C);}

      /* needs-you-now / waiting list */
      .now-items{list-style:none;margin:0;padding:0;}
      .now-item{display:flex;flex-wrap:wrap;align-items:flex-start;gap:12px 14px;
        padding:15px 6px;margin:0 -6px;border-top:1px solid var(--line,#E3D7BA);
        border-radius:var(--radius,14px);cursor:pointer;
        transition:background .15s ease;
        opacity:0;transform:translateY(6px);animation:now-rise .32s ease-out forwards;}
      .now-item:hover{background:var(--surface-2,#FFFDF4);}
      .now-item:first-child{border-top:none;}
      .now-item-num{width:32px;flex-shrink:0;display:flex;flex-direction:column;
        align-items:center;gap:8px;padding-top:3px;}
      .now-item-num span{font-family:var(--display,inherit);font-size:12px;font-weight:700;
        color:var(--ink-faint,#A89A7C);}
      .now-item-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
      .now-item.lit .now-item-dot{background:var(--lantern,#C4661F);
        box-shadow:0 0 0 3px var(--lantern-glow,rgba(196,102,31,.32));
        animation:now-breathe 4.5s ease-in-out infinite;}
      .now-item.warm .now-item-dot{background:var(--amber,#B08A2A);}
      .now-item-body{flex:1 1 200px;min-width:180px;}
      .now-item-label{font-size:0.58rem;letter-spacing:0.14em;text-transform:uppercase;
        color:var(--ink-soft,#7C6A4F);font-weight:700;}
      .now-item-title{font-size:16px;font-weight:700;color:var(--ink,#45301E);margin-top:5px;}
      .now-item-detail{font-size:13px;color:var(--ink-soft,#7C6A4F);margin-top:3px;}
      .now-item-cta{flex:0 0 auto;font:inherit;font-size:13.5px;font-weight:500;color:#fff;
        background:var(--accent,#5F6F52);border:none;border-radius:var(--radius,14px);
        padding:9px 16px;cursor:pointer;align-self:center;
        transition:background .18s ease,transform .06s ease;}
      .now-item-cta:hover{background:var(--accent-deep,#4B5840);}
      .now-item-cta:active{transform:translateY(1px);}
      .now-waiting-label{padding:20px 0 4px;border-top:1px solid var(--line,#E3D7BA);
        font-size:0.6rem;letter-spacing:0.16em;text-transform:uppercase;
        color:var(--ink-faint,#A89A7C);font-weight:700;margin-top:6px;}
      .now-items + .now-waiting-label{border-top:none;}
      .now-note{margin-top:16px;font-size:12.5px;color:var(--ink-faint,#A89A7C);}

      /* cleared today */
      .now-cleared-label{font-size:0.6rem;letter-spacing:0.16em;text-transform:uppercase;
        color:var(--ink-faint,#A89A7C);font-weight:700;padding-bottom:6px;}
      .now-cleared{list-style:none;margin:0;padding:0;}
      .now-cleared-row{display:flex;align-items:flex-start;gap:12px;padding:14px 0;
        border-top:1px solid var(--line,#E3D7BA);
        opacity:0;transform:translateY(6px);animation:now-rise .32s ease-out forwards;}
      .now-cleared-dot{width:6px;height:6px;border-radius:50%;background:var(--accent,#5F6F52);
        flex-shrink:0;margin-top:6px;}
      .now-cleared-body{flex:1 1 auto;min-width:0;}
      .now-cleared-text{font-size:15px;color:var(--ink,#45301E);font-weight:500;}
      .now-cleared-detail{font-size:12.5px;color:var(--ink-faint,#A89A7C);margin-top:2px;}
      .now-cleared-time{font-size:12.5px;color:var(--ink-faint,#A89A7C);flex:0 0 auto;}
      .now-empty-quiet{font-size:14px;color:var(--ink-soft,#7C6A4F);}

      @keyframes now-rise{to{opacity:1;transform:none;}}
      @keyframes now-breathe{
        0%,100%{box-shadow:0 0 0 3px var(--lantern-glow,rgba(196,102,31,.32));}
        50%{box-shadow:0 0 0 6px rgba(196,102,31,.14);}
      }
      @media (prefers-reduced-motion:reduce){
        .now-hero,.now-item,.now-cleared-row{animation:none;opacity:1;transform:none;}
        .now-item.lit .now-item-dot{animation:none;}
      }
      @media (max-width:720px){
        .now-hero-num{font-size:64px;}
        .now-hero-title{font-size:21px;}
      }
    `;
    document.head.appendChild(s);
  }

  window.renderNowBlock = async function (host, sb) {
    if (!host) return;
    injectStyles();
    let st;
    try { st = await computeState(sb); }
    catch (e) { console.error("now block failed", e); return; }

    const dateStr = new Date().toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    }) + " · " + hhmm();

    const urgent = st.items.filter((i) => i.tone === "lit");
    const waiting = st.items.filter((i) => i.tone === "warm");
    const total = st.items.length;
    const quiet = total === 0;

    // Hero
    const heroHtml = quiet
      ? `<div class="now-hero quiet">
           <div class="now-hero-check">
             <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent,#5F6F52)"
                  stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
               <path d="M5.5 12.6 10 17l8.5-9.4"></path>
             </svg>
           </div>
           <div class="now-hero-body">
             <p class="now-hero-title">Nothing needs you</p>
             <p class="now-hero-sub">All ${window.dmicoVisibleCount ? window.dmicoVisibleCount() : 7} modules are quiet. This is the normal state.</p>
           </div>
         </div>`
      : `<div class="now-hero">
           <span class="now-hero-num">${urgent.length || total}</span>
           <div class="now-hero-body">
             <p class="now-hero-title">${(urgent.length || total) === 1
               ? (urgent.length ? "thing needs you" : "thing is waiting")
               : (urgent.length ? "things need you" : "things are waiting")}</p>
             <p class="now-hero-sub">${urgent.length && waiting.length
               ? `${waiting.length} more can wait.`
               : urgent.length ? "Nothing else is waiting." : "Nothing urgent yet."}</p>
           </div>
         </div>`;

    // Next up
    const nextUpHtml = st.nextUp
      ? `<div class="now-nextup-row">
           <div><span class="now-nextup-label">Time</span><div class="now-nextup-time">${esc(st.nextUp.start)}</div></div>
           <div>
             <span class="now-nextup-label">Block</span>
             <div class="now-nextup-title">${esc(st.nextUp.title)}</div>
             <div class="now-nextup-detail">${st.nextUp.remaining - 1 > 0 ? `${st.nextUp.remaining - 1} block${st.nextUp.remaining - 1 === 1 ? "" : "s"} left today` : "Last block today"}</div>
           </div>
         </div>
         ${st.thenUp ? `
         <div class="now-nextup-row">
           <div><span class="now-nextup-label">Then</span><div class="now-nextup-time then">${esc(st.thenUp.start)}</div></div>
           <div><div class="now-nextup-detail" style="margin-top:5px;">${esc(st.thenUp.title)}</div></div>
         </div>` : ""}`
      : `<p class="now-nextup-empty">Nothing left on the calendar today.</p>`;

    // Needs-you-now + waiting list
    let listHtml = "";
    if (total) {
      const row = (item, num) => {
        const label = item.tone === "lit"
          ? "Needs you now" + (item.module ? " · " + item.module.toUpperCase() : "")
          : (item.module || "").toUpperCase();
        const mod = item.module || "dashboard";
        // The whole row navigates to the item's module (waiting items have no other
        // way in); lit items also get an explicit primary-action button.
        return `
        <li class="now-item ${item.tone}" data-mod="${esc(mod)}" style="animation-delay:${Math.min((num - 1) * 60, 240)}ms">
          <div class="now-item-num"><span>${String(num).padStart(2, "0")}</span><span class="now-item-dot"></span></div>
          <div class="now-item-body">
            <div class="now-item-label">${esc(label)}</div>
            <div class="now-item-title">${esc(item.text)}</div>
            ${item.detail ? `<div class="now-item-detail">${esc(item.detail)}</div>` : ""}
          </div>
          ${item.tone === "lit" && item.cta ? `<button class="now-item-cta" data-mod="${esc(mod)}">${esc(item.cta)}</button>` : ""}
        </li>`;
      };

      const urgentRows = urgent.map((it, i) => row(it, i + 1)).join("");
      const waitingRows = waiting.map((it, i) => row(it, urgent.length + i + 1)).join("");

      listHtml = `
        ${urgentRows ? `<ol class="now-items">${urgentRows}</ol>` : ""}
        ${waitingRows ? `<div class="now-waiting-label">(waiting)</div><ol class="now-items">${waitingRows}</ol>` : ""}
        <p class="now-note">${urgent.length && waiting.length
          ? "Everything else is quiet."
          : urgent.length ? "Nothing else is waiting."
          : "None of this is urgent yet."}</p>`;
    } else {
      const clearedRows = st.cleared.map((c, i) => `
        <li class="now-cleared-row" style="animation-delay:${Math.min(i * 60, 240)}ms">
          <span class="now-cleared-dot"></span>
          <div class="now-cleared-body">
            <span class="now-cleared-text">${esc(c.text)}</span>
            ${c.detail ? `<div class="now-cleared-detail">${esc((c.module || "").toUpperCase())} · ${esc(c.detail)}</div>` : ""}
          </div>
          ${c.time ? `<span class="now-cleared-time">${esc(c.time)}</span>` : ""}
        </li>`).join("");
      listHtml = `
        <div class="now-cleared-label">(cleared today)</div>
        ${clearedRows
          ? `<ul class="now-cleared">${clearedRows}</ul><p class="now-note">Nothing else is due before your next check-in.</p>`
          : `<p class="now-empty-quiet">Nothing logged yet today, and nothing is overdue either.</p>`}`;
    }

    host.innerHTML = `
      <section class="now-block" aria-label="Right now">
        <div class="now-top">
          <span class="now-eyebrow">(right now)</span>
          <span class="now-date">${esc(dateStr)}</span>
        </div>
        <div class="now-grid">
          <div class="now-col">
            ${heroHtml}
            <div class="now-nextup">
              <div class="now-eyebrow" style="margin-bottom:14px;">(next up)</div>
              ${nextUpHtml}
            </div>
          </div>
          <div class="now-col">
            ${listHtml}
          </div>
        </div>
      </section>`;

    host.querySelectorAll("[data-mod]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const mod = b.dataset.mod;
        if (mod && mod !== "dashboard" && window.__openModule) window.__openModule(mod);
      })
    );
  };
})();
