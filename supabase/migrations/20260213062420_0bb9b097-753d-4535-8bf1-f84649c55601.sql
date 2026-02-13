-- Allow managers to view user_roles for users in the same showroom
CREATE POLICY "Manager can view showroom user roles"
ON public.user_roles
FOR SELECT
USING (
  has_role(auth.uid(), 'manager'::app_role) 
  AND showroom_id = (
    SELECT ur.showroom_id FROM public.user_roles ur WHERE ur.user_id = auth.uid() LIMIT 1
  )
);