-- Remove duplicate executive role for admin user who already has admin role
DELETE FROM public.user_roles 
WHERE user_id = '3a124efa-7d1d-4f52-b2f8-910c6d53a974' 
AND role = 'executive';