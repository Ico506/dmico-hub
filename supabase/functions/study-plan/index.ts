// study-plan
// Supabase Edge Function (Deno / TypeScript).
// Receives an exam descriptor and asks the Gemini API to produce a
// spaced-repetition study schedule. Returns clean JSON; the frontend
// writes it into the study_exams.plan column.
//
// Expected POST body:
//   { title, exam_date?, hours_per_day?, topics? }
//
// Secrets required in the Supabase Dashboard:
//   GEMINI_API_KEY   (required)
//   GEMINI_MODEL     (optional, defaults to gemini-2.5-flash)

const GEMINI_KEY   = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemma-4-31b-it";
const GEMINI_URL   =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Days between today (midnight) and a YYYY-MM-DD date string.
// Negative means the date is in the past.
function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

// Build the prompt that asks Gemini to output the plan schema we want.
function buildPrompt(params: {
  title: string;
  examDate: string | null;
  days: number | null;
  hoursPerDay: number;
  topicList: string[];
}): string {
  const { title, examDate, days, hoursPerDay, topicList } = params;

  const dateContext = examDate
    ? `${examDate} (${days !== null ? (days > 0 ? `${days} days away` : days === 0 ? "today" : `${-days} days ago`) : "unknown offset"})`
    : "no date set";

  // Total study sessions = introduce each topic + ~half revisited + one final practice run.
  // Cap at days available if date is known and upcoming.
  const rawSessionCount = topicList.length + Math.ceil(topicList.length * 0.6) + 1;
  const sessionCap = (days !== null && days > 0) ? days : rawSessionCount * 2;
  const plannedSessions = Math.min(rawSessionCount, sessionCap);

  // Distribute sessions across available days, using today as Day 1.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayStep = (days !== null && days > 0 && plannedSessions > 1)
    ? Math.max(1, Math.floor(days / plannedSessions))
    : 1;

  return `You are a study coach. Generate a concise spaced-repetition study plan.

EXAM / DEADLINE: ${title}
DATE: ${dateContext}
HOURS AVAILABLE PER DAY: ${hoursPerDay}
TOPICS TO COVER: ${topicList.join(", ")}

RULES:
1. Plan exactly ${plannedSessions} study sessions.
2. Spread sessions across the available days, starting from today. If no date is set, space them 1–2 days apart.
3. Session dates must be in YYYY-MM-DD format and must not fall on or after the exam date (if one is set).
4. Use spaced repetition: introduce each topic first ("learn"), revisit it 2–4 days later ("review"), then do a combined revision near the end ("practice").
5. Keep every session's hours at or below ${hoursPerDay}.
6. The last 1–2 sessions should be type "practice" (mixed revision).
7. "task" should be a single brief sentence of what to actually do (e.g. "Read chapter 3 and write summary notes").

Return ONLY valid JSON matching this exact schema. No markdown fences, no extra keys, no commentary:
{
  "summary": "<one sentence describing the overall plan>",
  "total_sessions": <integer>,
  "sessions": [
    {
      "label": "<Day N>",
      "date": "<YYYY-MM-DD or null>",
      "topic": "<topic name>",
      "task": "<what to do>",
      "hours": <number>,
      "type": "<learn | review | practice>"
    }
  ]
}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!GEMINI_KEY) {
    return json({ error: "GEMINI_API_KEY secret not set in Supabase Dashboard." }, 500);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* empty body */ }

  const title        = String(body.title ?? "").trim();
  const examDate     = typeof body.exam_date === "string" ? body.exam_date : null;
  const hoursPerDay  = Math.max(0.5, Number(body.hours_per_day) || 2);
  const topicsRaw    = typeof body.topics === "string" ? body.topics : "";
  const topicList    = topicsRaw
    .split(",")
    .map((t: string) => t.trim())
    .filter(Boolean);

  if (!title) return json({ error: "title is required." }, 400);
  if (topicList.length === 0) topicList.push("General revision");

  const days = daysUntil(examDate);

  if (days !== null && days <= 0) {
    return json({ error: "The exam date is today or in the past. Nothing to plan." }, 400);
  }

  const prompt = buildPrompt({ title, examDate, days, hoursPerDay, topicList });

  // Call Gemini. responseMimeType forces clean JSON output with no markdown wrapping.
  let geminiRes: Response;
  try {
    geminiRes = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
  } catch (err) {
    return json({ error: `Network error calling Gemini: ${err}` }, 502);
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => "");
    return json({ error: `Gemini returned ${geminiRes.status}: ${errText}` }, 502);
  }

  const geminiData = await geminiRes.json();
  const raw: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  let plan: Record<string, unknown>;
  try {
    plan = JSON.parse(raw);
  } catch (_) {
    // Fallback: strip markdown fences if responseMimeType hint was ignored.
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    try {
      plan = JSON.parse(stripped);
    } catch (_) {
      return json({ error: "Gemini returned unparseable JSON.", raw }, 502);
    }
  }

  plan.generated_at    = new Date().toISOString();
  plan.generated_model = GEMINI_MODEL;

  return json(plan);
});
