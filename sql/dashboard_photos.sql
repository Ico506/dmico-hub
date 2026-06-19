-- dashboard_photos — framed pictures rail on the Home dashboard.
-- Images live in the PRIVATE Supabase Storage bucket 'dashboard-photos';
-- this table stores the object path + optional caption. The hub renders them
-- via short-lived signed URLs (createSignedUrls), so nothing is world-readable.

CREATE TABLE IF NOT EXISTS public.dashboard_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL,            -- path within the dashboard-photos bucket
  caption      text,                     -- optional single line, hidden by default in UI
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  added_via    text DEFAULT 'web'
);

ALTER TABLE public.dashboard_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated full access" ON public.dashboard_photos;
CREATE POLICY "authenticated full access" ON public.dashboard_photos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Private bucket (run once; mirrors museum-glb).
INSERT INTO storage.buckets (id, name, public)
VALUES ('dashboard-photos', 'dashboard-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage object policies scoped to this bucket, authenticated role only.
DROP POLICY IF EXISTS "dashboard-photos auth select" ON storage.objects;
CREATE POLICY "dashboard-photos auth select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'dashboard-photos');
DROP POLICY IF EXISTS "dashboard-photos auth insert" ON storage.objects;
CREATE POLICY "dashboard-photos auth insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'dashboard-photos');
DROP POLICY IF EXISTS "dashboard-photos auth update" ON storage.objects;
CREATE POLICY "dashboard-photos auth update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'dashboard-photos') WITH CHECK (bucket_id = 'dashboard-photos');
DROP POLICY IF EXISTS "dashboard-photos auth delete" ON storage.objects;
CREATE POLICY "dashboard-photos auth delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'dashboard-photos');
