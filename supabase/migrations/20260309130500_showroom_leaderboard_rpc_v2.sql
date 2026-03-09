-- Migration: 20260309130500_showroom_leaderboard_rpc_v2.sql
-- Description: Update the security definer function to properly aggregate stats

CREATE OR REPLACE FUNCTION get_showroom_leaderboard(p_showroom_id UUID)
RETURNS TABLE (
    user_id UUID,
    full_name TEXT,
    visits_count BIGINT,
    wos_count BIGINT,
    wos_won_total NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        ur.user_id,
        p.full_name,
        COALESCE((
            SELECT COUNT(*)
            FROM visits v
            WHERE v.created_by = ur.user_id
              AND v.status = 'done'
        ), 0) AS visits_count,
        COALESCE((
            SELECT COUNT(*)
            FROM work_scope_items w
            WHERE w.created_by = ur.user_id
        ), 0) AS wos_count,
        COALESCE((
            SELECT SUM(CAST(w.amount_in_lac AS NUMERIC))
            FROM work_scope_items w
            WHERE w.created_by = ur.user_id
              AND (w.work_status = 'won' OR w.verified_amount IS NOT NULL)
        ), 0) AS wos_won_total
    FROM 
        user_roles ur
    JOIN 
        profiles p ON ur.user_id = p.user_id
    WHERE 
        ur.showroom_id = p_showroom_id
        AND ur.role = 'executive';
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION get_showroom_leaderboard(UUID) TO authenticated;
