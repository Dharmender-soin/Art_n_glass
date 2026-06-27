CREATE OR REPLACE FUNCTION public.get_cron_run_details()
RETURNS TABLE (jobid bigint, runid bigint, job_pid integer, database text, username text, command text, status text, return_message text, start_time timestamp with time zone, end_time timestamp with time zone) AS $$
BEGIN
  RETURN QUERY SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
