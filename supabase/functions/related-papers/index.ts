// related-papers
// Supabase Edge Function (Deno / TypeScript).
// Given a DOI and/or title, returns up to 10 related papers via OpenAlex.
// No API key needed. Add your email as OPENALEX_EMAIL secret to join the
// polite pool (faster rate limits, same results).
//
// Expected POST body: { doi?: string, title?: string }
// Response:           { papers: [...], via: "doi" | "search" }
//
// Secrets (optional):
//   OPENALEX_EMAIL   (your email for the OpenAlex polite pool)

const MAILTO = Deno.env.get("OPENALEX_EMAIL") ?? "";

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

// Append mailto to OpenAlex URLs for the polite pool.
function oaUrl(path: string, params: Record<string, string> = {}): string {
  const u = new URL("https://api.openalex.org" + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (MAILTO) u.searchParams.set("mailto", MAILTO);
  return u.toString();
}

// Map an OpenAlex work object to the shape research.js expects.
function mapWork(w: Record<string, unknown>): Record<string, unknown> {
  const authorships = Array.isArray(w.authorships)
    ? (w.authorships as Record<string, unknown>[])
    : [];

  const authors = authorships
    .map((a) => ((a.author as Record<string, unknown>)?.display_name as string) ?? "")
    .filter(Boolean);

  const loc = (w.primary_location as Record<string, unknown>) ?? {};
  const source = (loc.source as Record<string, unknown>) ?? {};
  const venue = (source.display_name as string) ?? "";
  const landingUrl = (loc.landing_page_url as string) ?? "";
  const doiUrl = typeof w.doi === "string" ? w.doi : "";
  const doi = doiUrl.replace("https://doi.org/", "");

  return {
    title:   (w.display_name as string) || (w.title as string) || "Untitled",
    authors,
    year:    (w.publication_year as number) ?? null,
    venue,
    doi,
    url:     landingUrl || doiUrl,
  };
}

// Batch-fetch up to 10 works by their OpenAlex IDs.
async function fetchByIds(ids: string[]): Promise<Record<string, unknown>[]> {
  const shortIds = ids
    .map((id) => id.replace("https://openalex.org/", ""))
    .filter((id) => /^W\d+$/.test(id))
    .slice(0, 10);

  if (!shortIds.length) return [];

  const url = oaUrl("/works", {
    filter:   `ids.openalex:${shortIds.join("|")}`,
    "per-page": "10",
  });

  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return ((data.results as Record<string, unknown>[]) ?? []).map(mapWork);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* empty body ok */ }

  const doi   = typeof body.doi   === "string" ? body.doi.trim()   : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!doi && !title) return json({ error: "Provide doi or title." }, 400);

  // ── Strategy 1: DOI → OpenAlex related_works (precomputed) ─
  if (doi) {
    try {
      const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//i, "");
      const res = await fetch(oaUrl(`/works/doi:${encodeURIComponent(cleanDoi)}`));

      if (res.ok) {
        const work = (await res.json()) as Record<string, unknown>;
        const relatedIds = (work.related_works as string[]) ?? [];

        if (relatedIds.length > 0) {
          const papers = await fetchByIds(relatedIds);
          if (papers.length > 0) return json({ papers, via: "doi" });
        }
      }
    } catch (_) {
      // Fall through to title search.
    }
  }

  // ── Strategy 2: Full-text title search (fallback) ──────────
  const query = title || doi;
  try {
    const url = oaUrl("/works", {
      search:     query,
      "per-page": "10",
      sort:       "relevance_score:desc",
    });
    const res = await fetch(url);
    if (!res.ok) return json({ error: `OpenAlex returned ${res.status}.` }, 502);
    const data = await res.json();
    const papers = ((data.results as Record<string, unknown>[]) ?? []).map(mapWork);
    return json({ papers, via: "search" });
  } catch (err) {
    return json({ error: `Network error reaching OpenAlex: ${err}` }, 502);
  }
});
