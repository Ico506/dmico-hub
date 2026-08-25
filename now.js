/* ─────────────────────────────────────────────────────────────
   dmico life os — the "right now" state engine
   One shared computation of what is currently true, used by:
     - the Home state block (renderNowBlock)
     - the lantern rail attention markers (dmicoAttentionMap)
     - the existing what-needs-you banner
   so every surface agrees. Jade's own alerts (kv 'jade_alerts', written by
   jade_events.py on the bot) feed straight in, which is what keeps Discord and
   the hub telling the same story.

   Tone language, three levels only, matching the lantern metaphor:
     lit   = needs you now      (alloy orange, the signature signal colour)
     warm  = waiting, not urgent (amber)
     calm  = nothing to do
   ───────────────────────────────────────────────────────────── */

(function () {
  let _cache = null;
  let _cacheAt = 0;
  const CACHE_MS = 60000;

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const rm = (n) => "RM " + Number(n || 0).toLocaleString(undefined,
    { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const hhmm = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  /* ── the computation ──────────────────────────────────────── */

  async function computeState(sb) {
    const now = Date.now();
    if (_cache && now - _cacheAt < CACHE_MS) return _cache;

    const t = todayISO();
    const items = [];   // things that want attention
    let nextUp = null;  // the calm "what's next" line

    const [alerts, mood, refl, digest, seenBlob, week] = await Promise.all([
      window.dmicoKvGet("jade_alerts"),
      window.dmicoKvGet("mood_data"),
      window.dmicoKvGet("reflections_data"),
      window.dmicoKvGet("curator_digest"),
      window.dmicoKvGet("hub_last_seen"),
      window.dmicoKvGet("week_calendar"),
    ]);

    // 1. Jade's own alerts from today. She has already decided these matter, so they
    //    lead, and we do not recompute her thresholds here.
    const aItems = (alerts && Array.isArray(alerts.items)) ? alerts.items : [];
    aItems.filter((a) => String(a.ts || "").slice(0, 10) === t).forEach((a) => {
      items.push({
        key: `jade:${a.id}`,
        module: moduleFromUrl(a.url),
        text: a.text,
        tone: "lit",
        source: "jade",
      });
    });

    // 2. Today's logging, mood and reflection. Warm during the day, lit after 21:00,
    //    because before evening an unlogged reflection is simply not due yet.
    const late = new Date().getHours() >= 21;
    const moodDone = ((mood && mood.entries) || []).some((e) => e.date === t);
    const reflDone = !!((refl && refl.daily) || {})[t];
    if (!moodDone) {
      items.push({ key: "mood", module: "life", text: "Mood not logged today",
                   tone: late ? "lit" : "warm" });
    }
    if (!reflDone) {
      items.push({ key: "reflect", module: "life", text: "Reflection not written yet",
                   tone: late ? "lit" : "warm" });
    }

    // 3. Money. Read live so it is never a stale snapshot.
    try {
      if (sb) {
        const [{ data: setRows }, { data: expRows }] = await Promise.all([
          sb.from("finance_settings").select("monthly_budget").limit(1),
          sb.from("finance_expenses").select("amount, logged_at"),
        ]);
        const budget = Number(setRows?.[0]?.monthly_budget || 0);
        const d = new Date();
        const spend = (expRows || []).reduce((s, e) => {
          const x = new Date(e.logged_at);
          return (x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth())
            ? s + Number(e.amount || 0) : s;
        }, 0);
        if (budget > 0) {
          const left = budget - spend;
          const pct = (spend / budget) * 100;
          if (pct >= 100) {
            items.push({ key: "budget", module: "finance", tone: "lit",
              text: `Over your spending limit by ${rm(Math.abs(left))}` });
          } else if (pct >= 80) {
            items.push({ key: "budget", module: "finance", tone: "warm",
              text: `${rm(left)} left of this month's limit` });
          }
        }
      }
    } catch (e) { console.error("now: finance read failed", e); }

    // 4. Unseen curator digests.
    const seen = (seenBlob && seenBlob.seen) || {};
    ["content", "research", "markets"].forEach((dom) => {
      const dg = digest && digest[dom];
      if (dg && dg.date === t && (dg.items || []).length && !seen[`${dom}:${t}`]) {
        items.push({ key: `digest:${dom}`, module: "curators", tone: "warm",
          text: `${dg.items.length} new ${dom} pick${dg.items.length === 1 ? "" : "s"}` });
      }
    });

    // 5. What is actually next on the calendar today (calm, not an alert).
    const evs = (week && Array.isArray(week.events)) ? week.events : [];
    const nowHM = hhmm();
    const todaysLeft = evs
      .filter((e) => e.date === t && !e.allDay && (e.end || "") > nowHM)
      .sort((a, b) => String(a.start).localeCompare(String(b.start)));
    if (todaysLeft.length) {
      const n = todaysLeft[0];
      nextUp = { title: n.title, start: n.start, end: n.end, remaining: todaysLeft.length };
    }

    // Deduplicate: if Jade already flagged something, drop our local copy of it so it
    // is not said twice on the same screen.
    const jadeText = new Set(items.filter((i) => i.source === "jade")
      .map((i) => i.text.toLowerCase()));
    const deduped = items.filter((i) =>
      i.source === "jade" ||
      !Array.from(jadeText).some((jt) => overlap(jt, i.text.toLowerCase())));

    const order = { lit: 0, warm: 1 };
    deduped.sort((a, b) => (order[a.tone] ?? 2) - (order[b.tone] ?? 2));

    _cache = { items: deduped, nextUp, date: t };
    _cacheAt = now;
    return _cache;
  }

  // Crude but effective: two lines are "the same thing" if they share a distinctive word.
  function overlap(a, b) {
    const keys = ["mood", "reflection", "budget", "limit", "pick", "digest"];
    return keys.some((k) => a.includes(k) && b.includes(k));
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

  /* ── the rail attention map ───────────────────────────────── */

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
      .now-block{margin:0 0 1.1rem;padding:1rem 1.15rem;border-radius:var(--radius-lg,22px);
        background:var(--surface,#FEFAE0);border:1px solid var(--line,#E3D7BA);
        box-shadow:var(--shadow,0 8px 24px rgba(69,48,30,.07));}
      .now-hero{display:flex;align-items:baseline;gap:.6rem;flex-wrap:wrap;margin-bottom:.15rem;}
      .now-hero-n{font-family:var(--display,inherit);font-size:2.1rem;font-weight:700;
        line-height:1;color:var(--ink,#45301E);}
      .now-hero-l{font-size:.95rem;color:var(--ink-soft,#7C6A4F);}
      .now-next{font-size:.9rem;color:var(--ink-soft,#7C6A4F);margin:.15rem 0 0;}
      .now-next b{color:var(--ink,#45301E);}
      .now-list{list-style:none;margin:.85rem 0 0;padding:0;display:flex;
        flex-direction:column;gap:.4rem;}
      .now-row{display:flex;align-items:center;gap:.6rem;padding:.45rem .6rem;
        border-radius:var(--radius,14px);background:var(--surface-2,#FFFDF4);
        border:1px solid transparent;cursor:pointer;font:inherit;font-size:.93rem;
        color:inherit;text-align:left;width:100%;
        opacity:0;transform:translateY(4px);animation:now-in .26s ease-out forwards;}
      .now-row:hover{border-color:var(--line,#E3D7BA);}
      .now-dot{width:7px;height:7px;border-radius:999px;flex:none;}
      .now-row.lit .now-dot{background:var(--lantern,#C4661F);
        box-shadow:0 0 0 3px var(--lantern-glow,rgba(196,102,31,.28));}
      .now-row.warm .now-dot{background:var(--amber,#B08A2A);opacity:.75;}
      .now-clear{font-size:.93rem;color:var(--ink-soft,#7C6A4F);margin:.7rem 0 0;}
      @keyframes now-in{to{opacity:1;transform:none;}}
      @media (prefers-reduced-motion:reduce){
        .now-row{animation:none;opacity:1;transform:none;}
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

    const n = st.items.length;
    const urgent = st.items.filter((i) => i.tone === "lit").length;
    const heroLabel = n === 0
      ? "Nothing needs you"
      : urgent > 0
        ? `${urgent === n ? "" : "of them "}need${urgent === 1 ? "s" : ""} you now`
        : "waiting, none urgent";

    const nextLine = st.nextUp
      ? `<p class="now-next">Next: <b>${esc(st.nextUp.title)}</b> at ${esc(st.nextUp.start)}` +
        (st.nextUp.remaining > 1 ? `, ${st.nextUp.remaining - 1} more after that today.` : ".") + `</p>`
      : `<p class="now-next">Nothing left on the calendar today.</p>`;

    const rows = st.items.map((i, idx) => `
      <li>
        <button class="now-row ${i.tone}" data-mod="${esc(i.module || "dashboard")}"
                style="animation-delay:${Math.min(idx * 40, 240)}ms">
          <span class="now-dot"></span><span>${esc(i.text)}</span>
        </button>
      </li>`).join("");

    host.innerHTML = `
      <section class="now-block" aria-label="Right now">
        <div class="now-hero">
          <span class="now-hero-n">${n === 0 ? "All clear" : (urgent || n)}</span>
          <span class="now-hero-l">${esc(heroLabel)}</span>
        </div>
        ${nextLine}
        ${n ? `<ul class="now-list">${rows}</ul>`
            : `<p class="now-clear">Logged, in budget, nothing waiting. Go and live your day.</p>`}
      </section>`;

    host.querySelectorAll(".now-row").forEach((b) =>
      b.addEventListener("click", () => {
        const mod = b.dataset.mod;
        if (mod && mod !== "dashboard" && window.__openModule) window.__openModule(mod);
      })
    );
  };
})();
