/* ─────────────────────────────────────────────────────────────
   dmico life os — web push opt-in (nudge v1)
   Registers the service worker and manages the ONE gentle evening
   nudge subscription. Opt-in only: nothing subscribes until you tap
   the bell. The subscription is stored in kv 'push_subscriptions',
   which the bot reads to send the evening push.
   ───────────────────────────────────────────────────────────── */

(function () {
  const CFG = window.DMICO_CONFIG || {};
  const VAPID = CFG.VAPID_PUBLIC_KEY || "";
  let swReg = null;

  function urlB64ToUint8(b64) {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  const supported = () =>
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  async function registerSW() {
    if (!("serviceWorker" in navigator)) return null;
    try {
      swReg = await navigator.serviceWorker.register("sw.js");
      return swReg;
    } catch (e) {
      console.error("SW register failed", e);
      return null;
    }
  }

  async function currentSub() {
    if (!swReg) return null;
    try { return await swReg.pushManager.getSubscription(); } catch (e) { return null; }
  }

  async function saveSub(sub) {
    const blob = (await window.dmicoKvGet("push_subscriptions")) || {};
    const list = Array.isArray(blob.subs) ? blob.subs : [];
    const json = sub.toJSON();
    const next = list.filter((s) => s.endpoint !== json.endpoint);
    next.push(json);
    await window.dmicoKvSet("push_subscriptions", { subs: next });
  }

  async function removeSub(endpoint) {
    const blob = (await window.dmicoKvGet("push_subscriptions")) || {};
    const list = Array.isArray(blob.subs) ? blob.subs : [];
    await window.dmicoKvSet("push_subscriptions", { subs: list.filter((s) => s.endpoint !== endpoint) });
  }

  async function enable() {
    if (!VAPID) { alert("Push key missing in config.js."); return false; }
    if (!supported()) {
      alert("This browser can't do push here. On Android, add DMICO to your home screen (⋮ → Add to Home screen / Install app), open it from there, then turn the nudge on.");
      return false;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return false;
    if (!swReg) await registerSW();
    if (!swReg) return false;
    try {
      const sub = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8(VAPID),
      });
      await saveSub(sub);
      return true;
    } catch (e) {
      console.error("subscribe failed", e);
      return false;
    }
  }

  async function disable() {
    const sub = await currentSub();
    if (sub) {
      await removeSub(sub.endpoint);
      try { await sub.unsubscribe(); } catch (e) {}
    }
  }

  async function refreshToggle(btn) {
    const sub = await currentSub();
    const on = !!sub && ("Notification" in window) && Notification.permission === "granted";
    btn.textContent = on ? "🔔 Nudge on" : "🔕 Nudge off";
    btn.dataset.on = on ? "1" : "0";
    btn.title = on
      ? "You'll get one gentle 7pm nudge when the hub has something waiting."
      : "Turn on a single gentle 7pm nudge to your phone.";
  }

  // Injected into the rail foot (next to Sign out). Called by the shell on login.
  window.dmicoInitNudgeUI = async function () {
    if (!("serviceWorker" in navigator)) return;
    await registerSW();
    const foot = document.querySelector(".rail-foot");
    if (!foot || document.getElementById("nudge-toggle")) return;
    const btn = document.createElement("button");
    btn.id = "nudge-toggle";
    btn.className = "btn-ghost";
    foot.insertBefore(btn, foot.firstChild);
    await refreshToggle(btn);
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const on = btn.dataset.on === "1";
      if (on) await disable();
      else await enable();
      await refreshToggle(btn);
      btn.disabled = false;
    });
  };
})();
