-- Research-to-thesis linkage: tie a saved paper to a thesis chapter.
-- Adds a nullable chapter_id FK to research_papers (supersedes the older
-- free-text thesis_section column for linkage). ON DELETE SET NULL so removing
-- a chapter just unlinks its papers rather than deleting them.

ALTER TABLE public.research_papers
  ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.thesis_chapters(id) ON DELETE SET NULL;

-- One-time best-effort migration of existing thesis_section text onto chapter ids
-- by matching chapter title (case-insensitive, trimmed).
UPDATE public.research_papers rp
SET chapter_id = tc.id
FROM public.thesis_chapters tc
WHERE rp.chapter_id IS NULL
  AND rp.thesis_section IS NOT NULL
  AND lower(trim(rp.thesis_section)) = lower(trim(tc.title));
