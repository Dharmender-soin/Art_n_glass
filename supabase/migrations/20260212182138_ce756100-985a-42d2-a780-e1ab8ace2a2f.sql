
-- 1. Make visit-photos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'visit-photos';

-- 2. Drop the public access policy
DROP POLICY IF EXISTS "Anyone can view visit photos" ON storage.objects;

-- 3. Create authenticated access policy matching business rules
CREATE POLICY "Authenticated users can view visit photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'visit-photos' AND (
    (storage.foldername(name))[1] = auth.uid()::text OR
    has_role(auth.uid(), 'admin'::app_role) OR
    (has_role(auth.uid(), 'manager'::app_role))
  )
);
