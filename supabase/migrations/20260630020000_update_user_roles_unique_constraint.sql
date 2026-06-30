-- Drop the restrictive unique constraint that prevents a user from having the same role in multiple showrooms
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

-- Add a new unique constraint allowing a user to have the same role across different showrooms
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_showroom_id_key UNIQUE (user_id, role, showroom_id);
