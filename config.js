/* ─────────────────────────────────────────────────────────────
   dmico life os — connection config

   Paste your publishable key below ONE time. This file is yours.
   Build updates to the other files will never overwrite it, so your
   connection details stay put from now on.

   Both values are safe to keep in this public repo: the publishable
   key only does what your Row Level Security policies allow. NEVER put
   the service_role / secret key here.
   ───────────────────────────────────────────────────────────── */

window.DMICO_CONFIG = {
  // Pre-filled from your project. Only change if your project URL changes.
  SUPABASE_URL: "https://vlczjdqqpajkggzjlsqe.supabase.co",

  // Settings → API Keys → Publishable key (sb_publishable_...). Paste it here:
  SUPABASE_ANON_KEY: "sb_publishable_CF0CgAOY4Ak70NRqILPWlA_IJWWcAuE",

  // Web-push public VAPID key (safe to ship; it is the PUBLIC half). The bot holds
  // the matching private key in a Railway env var. Used to subscribe this device
  // to the one gentle evening nudge.
  VAPID_PUBLIC_KEY: "BLal1o5EwMxhmbPp8_lPuMSzfPC2kjdo9mNRxExVayHPzCzLyCb11WiSPEDD2WoxXyyV8OdPGfmI1qgXEH8wJbs",
};
