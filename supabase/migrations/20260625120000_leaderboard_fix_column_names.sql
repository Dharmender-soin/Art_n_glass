-- Fix leaderboard RPC: keep visits_count column name (matches types.ts), add role column
DROP FUNCTION IF EXISTS public.get_showroom_leaderboard(uuid);

CREATE OR REPLACE FUNCTION public.get_showroom_leaderboard(p_showroom_id uuid)
RETURNS TABLE (
    user_id uuid,
    full_name text,
    role text,
    visits_count bigint,
    wos_count bigint,
    wos_won_total bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.user_id,
        p.full_name,
        u.role::text,
        -- Total completed visits
        COALESCE(
            (SELECT COUNT(*) FROM public.visits v WHERE v.created_by = u.user_id AND v.status = 'done'), 
            0
        )::bigint as visits_count,
        -- Total WOS items added
        COALESCE(
            (SELECT COUNT(*) FROM public.work_scope_items w WHERE w.created_by = u.user_id), 
            0
        )::bigint as wos_count,
        -- WOS items Won
        COALESCE(
            (SELECT COUNT(*) FROM public.work_scope_items w 
             WHERE w.created_by = u.user_id 
             AND (w.work_status = 'won' OR w.is_verified = true)), 
            0
        )::bigint as wos_won_total
    FROM public.user_roles u
    JOIN public.profiles p ON p.user_id = u.user_id
    WHERE u.showroom_id = p_showroom_id
    AND u.role IN ('executive', 'tl', 'manager');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_showroom_leaderboard(uuid) TO authenticated;
