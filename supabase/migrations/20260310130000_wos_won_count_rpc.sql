-- Drop the existing function first just in case
DROP FUNCTION IF EXISTS public.get_showroom_leaderboard(uuid);

-- Create the updated function
CREATE OR REPLACE FUNCTION public.get_showroom_leaderboard(p_showroom_id uuid)
RETURNS TABLE (
    user_id uuid,
    full_name text,
    visits bigint,
    wos_count bigint,
    wos_won_total bigint
)
LANGUAGE plpgsql
SECURITY DEFINER -- This allows bypassing RLS for the exact queries inside this function
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.user_id,
        p.full_name,
        -- Total completed visits
        COALESCE(
            (SELECT COUNT(*) FROM public.visits v WHERE v.created_by = u.user_id AND v.status = 'done'), 
            0
        ) as visits,
        -- Total WOS items added
        COALESCE(
            (SELECT COUNT(*) FROM public.work_scope_items w WHERE w.created_by = u.user_id), 
            0
        ) as wos_count,
        -- WOS items Won (we count the rows instead of summing amount_in_lac)
        COALESCE(
            (SELECT COUNT(*) FROM public.work_scope_items w 
             WHERE w.created_by = u.user_id 
             AND (w.work_status = 'won' OR w.is_verified = true)), 
            0
        ) as wos_won_total
    FROM public.user_roles u
    JOIN public.profiles p ON p.user_id = u.user_id
    WHERE u.showroom_id = p_showroom_id
    AND u.role = 'executive';
END;
$$;
