-- Migration: 20260309130000_showroom_leaderboard_rpc.sql
-- Description: Create a security definer function to aggregate leaderboard stats for a showroom
-- skipping RLS policies for individual tables `visits` and `work_scope_items`.

CREATE OR REPLACE FUNCTION get_showroom_leaderboard(p_showroom_id UUID)
RETURNS TABLE (
    user_id UUID,
    full_name TEXT,
    visits_count BIGINT,
    wos_count BIGINT,
    wos_won_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH showroom_users AS (
        -- Get all executives in the showroom
        SELECT 
            ur.user_id,
            p.full_name
        FROM 
            user_roles ur
        JOIN 
            profiles p ON ur.user_id = p.user_id
        WHERE 
            ur.showroom_id = p_showroom_id
            AND ur.role = 'executive'
    ),
    user_stats AS (
        SELECT 
            su.user_id,
            su.full_name,
            -- Count completed visits
            COALESCE((
                SELECT COUNT(*)
                FROM visits v
                WHERE v.created_by = su.user_id
                  AND v.status = 'done'
            ), 0) AS visits_count,
            -- Count wos entries
            COALESCE((
                SELECT COUNT(*)
                FROM work_scope_items w
                WHERE w.created_by = su.user_id
            ), 0) AS wos_count,
            -- Sum won wos estimated values
            COALESCE((
                SELECT SUM(CAST(w.amount_in_lac AS NUMERIC))
                FROM work_scope_items w
                WHERE w.created_by = su.user_id
                  AND (w.work_status = 'won' OR w.verified_amount IS NOT NULL)
            ), 0) AS wos_won_total
        FROM 
            showroom_users su
    )
    SELECT * FROM user_stats;
END;
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION get_showroom_leaderboard(UUID) TO authenticated;
