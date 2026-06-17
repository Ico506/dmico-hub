// related-papers
// A small Supabase Edge Function that proxies OpenAlex so the API key stays
// server-side (never in the browser) and we get reliable, dedicated rate limits.
//
// It does two things:
//   { "doi": "10.xxxx/..." }  -> finds papers related to that one
//   { "query": "some text" }  -> a plain OpenAlex search (handy fallback)
// and always returns a clean { "papers": [ {title, authors, year, venue, doi, url} ] }.

const OA_KEY = Deno.env.get("OPENALEX_API_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SELECT = "id,title,authorships,publication_year,primary_location,doi";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function mapWork(w: any) {
  return {
    title: w.title || w.display_name || "Untitled",
    authors: (w.authorships || []).map((a: any) => a.author?.display_name).filter(Boolean),
    year: w.publication_year ?? null,
    venue: w.primary_location?.source?.display_name || "",
    doi: (w.doi || "").replace("https://doi.org/", ""),
    url: w.doi || w.id || "",
  };
}

async function oa(url: string) {
  const sep = url.includes("?") ? "&" : "?";
  const full = OA_KEY ? `${url}${sep}api_key=${OA_KEY}` : url;
  const r = await fetch(full);
  if (!r.ok) throw new Error(`OpenAlex ${r.status}`);
  return r.json();
}

async function searchByText(text: string, excludeId: string | null) {
  if (!text) return [];
  const res = await oa(
    `https://api.openalex.org/works?search=${encodeURIComponent(text)}&select=${SELECT}&per-page=13`,
  );
  let results = res.results || [];
  if (excludeId) results = results.filter((w: any) => w.id !== excludeId);
  return results.slice(0, 12).map(mapWork);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { doi, title, query } = await req.json().catch(() => ({}));

    if (doi) {
      let seed: any = null;
      try {
        seed = await oa(
          `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?select=id,title,related_works`,
        );
      } catch (_) {
        seed = null; // DOI unknown to OpenAlex — we'll fall back to a title search
      }

      if (seed) {
        const ids = (seed.related_works || [])
          .slice(0, 12)
          .map((u: string) => u.split("/").pop())
          .filter(Boolean);
        if (ids.length) {
          const res = await oa(
            `https://api.openalex.org/works?filter=ids.openalex:${ids.join("|")}&select=${SELECT}&per-page=12`,
          );
          return json({ papers: (res.results || []).map(mapWork), via: "related" });
        }
        // Paper exists but has no precomputed neighbours — match by title instead
        return json({ papers: await searchByText(title || seed.title, seed.id), via: "search" });
      }

      // DOI unknown to OpenAlex — match by title
      return json({ papers: await searchByText(title, null), via: "search" });
    }

    if (query || title) {
      return json({ papers: await searchByText(query || title, null), via: "search" });
    }

    return json({ error: "Send a doi or a query." }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
