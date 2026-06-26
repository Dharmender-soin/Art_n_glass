-- ─────────────────────────────────────────────────────────────
-- MIGRATION: Automated Alerts & System Notifications Logic
-- DATE: 2026-06-26
-- ─────────────────────────────────────────────────────────────

-- 1. Function to check daily inactivity and partner visits alerts
CREATE OR REPLACE FUNCTION public.check_and_trigger_daily_alerts()
RETURNS void AS $$
DECLARE
  rec RECORD;
  mgr RECORD;
  last_active TIMESTAMP WITH TIME ZONE;
  days_inactive NUMERIC;
  days_since_visit NUMERIC;
  last_visit TIMESTAMP WITH TIME ZONE;
BEGIN
  -- ─────────────────────────────────────────────────────────────
  -- A. SYSTEM INACTIVITY CHECK (Runs daily)
  -- ─────────────────────────────────────────────────────────────
  FOR rec IN
    SELECT 
      ur.user_id,
      ur.reports_to,
      ur.showroom_id,
      p.full_name AS employee_name
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'executive' AND ur.is_active = true
  LOOP
    -- Calculate last active date from attendance, WOS, clients, or visits
    SELECT GREATEST(
      (SELECT MAX(created_at) FROM public.daily_attendance WHERE user_id = rec.user_id),
      (SELECT MAX(created_at) FROM public.work_scope_items WHERE created_by = rec.user_id),
      (SELECT MAX(created_at) FROM public.clients WHERE created_by = rec.user_id),
      (SELECT MAX(done_at) FROM public.visits WHERE created_by = rec.user_id AND status = 'done')
    ) INTO last_active;

    -- Default to user creation date if no activity registered yet
    IF last_active IS NULL THEN
      SELECT created_at INTO last_active FROM public.profiles WHERE user_id = rec.user_id;
    END IF;

    IF last_active IS NOT NULL THEN
      days_inactive := EXTRACT(epoch FROM (now() - last_active)) / 86400.0;

      -- Day 2 Alert: Executive Reminder (between 2.0 and 3.0 days)
      IF days_inactive >= 2.0 AND days_inactive < 3.0 THEN
        -- Verify no similar alert scheduled in the last 24h
        IF NOT EXISTS (
          SELECT 1 FROM public.scheduled_notifications 
          WHERE target_type = 'individual' AND target_id = rec.user_id::text 
            AND title = 'Inactivity Reminder ⏳' AND created_at >= now() - interval '24 hours'
        ) THEN
          INSERT INTO public.scheduled_notifications (title, body, target_type, target_id, target_url, scheduled_for)
          VALUES (
            'Inactivity Reminder ⏳',
            'You have not updated any activity or visits in 2 days. Please log your updates.',
            'individual',
            rec.user_id::text,
            '/',
            now()
          );
        END IF;

      -- Day 3 Alert: Team Leader Alert (between 3.0 and 5.0 days)
      ELSIF days_inactive >= 3.0 AND days_inactive < 5.0 AND rec.reports_to IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.scheduled_notifications 
          WHERE target_type = 'individual' AND target_id = rec.reports_to::text 
            AND title = 'Team Inactivity Alert ⚠️' AND body LIKE rec.employee_name || '%' AND created_at >= now() - interval '24 hours'
        ) THEN
          INSERT INTO public.scheduled_notifications (title, body, target_type, target_id, target_url, scheduled_for)
          VALUES (
            'Team Inactivity Alert ⚠️',
            rec.employee_name || ' has no activity for 3 days. Please follow up.',
            'individual',
            rec.reports_to::text,
            '/hierarchy',
            now()
          );
        END IF;

      -- Day 5 Alert: Manager Escalation (>= 5.0 days)
      ELSIF days_inactive >= 5.0 AND rec.showroom_id IS NOT NULL THEN
        -- Find managers in the same showroom
        FOR mgr IN 
          SELECT user_id FROM public.user_roles 
          WHERE showroom_id = rec.showroom_id AND role = 'manager' AND is_active = true
        LOOP
          IF NOT EXISTS (
            SELECT 1 FROM public.scheduled_notifications 
            WHERE target_type = 'individual' AND target_id = mgr.user_id::text 
              AND title = 'Employee Inactivity Escalation 🚨' AND body LIKE rec.employee_name || '%' AND created_at >= now() - interval '24 hours'
          ) THEN
            INSERT INTO public.scheduled_notifications (title, body, target_type, target_id, target_url, scheduled_for)
            VALUES (
              'Employee Inactivity Escalation 🚨',
              rec.employee_name || ' has no activity for 5+ days. Action required.',
              'individual',
              mgr.user_id::text,
              '/hierarchy',
              now()
            );
          END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  -- ─────────────────────────────────────────────────────────────
  -- B. PARTNER VISIT CYCLE CHECK (15-Day Logic)
  -- ─────────────────────────────────────────────────────────────
  FOR rec IN
    SELECT 
      p.id AS partner_id,
      p.name AS partner_name,
      p.created_by AS exec_id,
      ur.reports_to AS tl_id,
      ur.showroom_id
    FROM public.partners p
    LEFT JOIN public.user_roles ur ON ur.user_id = p.created_by
    WHERE NOT (
      LOWER(p.name) LIKE '%zirakpur%' OR LOWER(p.name) LIKE '%kirti nagar%' OR LOWER(p.name) LIKE '%kirtinagar%' OR
      LOWER(p.name) LIKE '%gurgaon%' OR LOWER(p.name) LIKE '%gurugram%' OR LOWER(p.name) LIKE '%art n glass%' OR
      LOWER(p.name) LIKE '%art & glass%' OR LOWER(p.name) LIKE '%art and glass%' OR LOWER(p.name) LIKE '%showroom%' OR
      LOWER(p.name) LIKE '%home%' OR LOWER(p.name) LIKE '%office%' OR LOWER(p.name) LIKE '%test%' OR
      LOWER(p.name) LIKE '%testing%' OR LOWER(p.name) LIKE '%demo%' OR LOWER(p.name) LIKE '%dummy%' OR
      LOWER(p.name) LIKE '%sample%' OR LOWER(p.name) LIKE '%internal%' OR LOWER(p.name) LIKE '%trial%'
    )
  LOOP
    -- Get last completed visit date
    SELECT MAX(visit_date::timestamp) INTO last_visit 
    FROM public.visits 
    WHERE partner_id = rec.partner_id AND status = 'done';

    -- Default to partner creation date if never visited
    IF last_visit IS NULL THEN
      SELECT created_at INTO last_visit FROM public.partners WHERE id = rec.partner_id;
    END IF;

    IF last_visit IS NOT NULL THEN
      days_since_visit := EXTRACT(epoch FROM (now() - last_visit)) / 86400.0;

      -- Day 5: Soft Reminder to Executive
      IF days_since_visit >= 5.0 AND days_since_visit < 6.0 THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.scheduled_notifications 
          WHERE target_type = 'individual' AND target_id = rec.exec_id::text 
            AND title = 'Partner Visit Pending ⏳' AND created_at >= now() - interval '24 hours'
        ) THEN
          INSERT INTO public.scheduled_notifications (title, body, target_type, target_id, target_url, scheduled_for)
          VALUES (
            'Partner Visit Pending ⏳',
            'Gentle reminder: You have partner visits pending. Please complete them before the deadline.',
            'individual',
            rec.exec_id::text,
            '/visits',
            now()
          );
        END IF;

      -- Day 7: Mid-cycle report to TL & Manager/GM
      ELSIF days_since_visit >= 7.0 AND days_since_visit < 8.0 THEN
        -- Send to TL
        IF rec.tl_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.scheduled_notifications 
          WHERE target_type = 'individual' AND target_id = rec.tl_id::text 
            AND title = 'Partner Visit Mid-Cycle Alert ⚠️' AND created_at >= now() - interval '24 hours'
        ) THEN
          INSERT INTO public.scheduled_notifications (title, body, target_type, target_id, target_url, scheduled_for)
          VALUES (
            'Partner Visit Mid-Cycle Alert ⚠️',
            'Your team has partner visits pending in this cycle.',
            'individual',
            rec.tl_id::text,
            '/hierarchy',
            now()
          );
        END IF;

        -- Send to Showroom Managers
        FOR mgr IN 
          SELECT user_id FROM public.user_roles 
          WHERE showroom_id = rec.showroom_id AND role = 'manager' AND is_active = true
        LOOP
          IF NOT EXISTS (
            SELECT 1 FROM public.scheduled_notifications 
            WHERE target_type = 'individual' AND target_id = mgr.user_id::text 
              AND title = 'Partner Visit Mid-Cycle Alert ⚠️' AND created_at >= now() - interval '24 hours'
          ) THEN
            INSERT INTO public.scheduled_notifications (title, body, target_type, target_id, target_url, scheduled_for)
            VALUES (
              'Partner Visit Mid-Cycle Alert ⚠️',
              'Showroom has partner visits pending in this cycle.',
              'individual',
              mgr.user_id::text,
              '/hierarchy',
              now()
            );
          END IF;
        END LOOP;

      -- Day 12: Strong Reminder to Executive + TL
      ELSIF days_since_visit >= 12.0 AND days_since_visit < 13.0 THEN
        -- Executive
        IF NOT EXISTS (
          SELECT 1 FROM public.scheduled_notifications 
          WHERE target_type = 'individual' AND target_id = rec.exec_id::text 
            AND title = 'Urgent: Partner Visit Pending 🚨' AND created_at >= now() - interval '24 hours'
        ) THEN
          INSERT INTO public.scheduled_notifications (title, body, target_type, target_id, target_url, scheduled_for)
          VALUES (
            'Urgent: Partner Visit Pending 🚨',
            'Strong reminder: You have partner visits pending. Please complete them before the deadline.',
            'individual',
            rec.exec_id::text,
            '/visits',
            now()
          );
        END IF;

        -- TL
        IF rec.tl_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.scheduled_notifications 
          WHERE target_type = 'individual' AND target_id = rec.tl_id::text 
            AND title = 'Urgent: Team Partner Visit Pending 🚨' AND created_at >= now() - interval '24 hours'
        ) THEN
          INSERT INTO public.scheduled_notifications (title, body, target_type, target_id, target_url, scheduled_for)
          VALUES (
            'Urgent: Team Partner Visit Pending 🚨',
            'Strong reminder: Your team has partner visits pending in this cycle.',
            'individual',
            rec.tl_id::text,
            '/hierarchy',
            now()
          );
        END IF;

      -- Day 15: Action Required to TL + Manager/GM
      ELSIF days_since_visit >= 15.0 AND days_since_visit < 16.0 THEN
        -- TL
        IF rec.tl_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM public.scheduled_notifications 
          WHERE target_type = 'individual' AND target_id = rec.tl_id::text 
            AND title = 'Action Required: Partner Overdue 🛑' AND created_at >= now() - interval '24 hours'
        ) THEN
          INSERT INTO public.scheduled_notifications (title, body, target_type, target_id, target_url, scheduled_for)
          VALUES (
            'Action Required: Partner Overdue 🛑',
            'Overdue: Your team has partner visits pending in this cycle.',
            'individual',
            rec.tl_id::text,
            '/hierarchy',
            now()
          );
        END IF;

        -- Managers
        FOR mgr IN 
          SELECT user_id FROM public.user_roles 
          WHERE showroom_id = rec.showroom_id AND role = 'manager' AND is_active = true
        LOOP
          IF NOT EXISTS (
            SELECT 1 FROM public.scheduled_notifications 
            WHERE target_type = 'individual' AND target_id = mgr.user_id::text 
              AND title = 'Action Required: Partner Overdue 🛑' AND created_at >= now() - interval '24 hours'
          ) THEN
            INSERT INTO public.scheduled_notifications (title, body, target_type, target_id, target_url, scheduled_for)
            VALUES (
              'Action Required: Partner Overdue 🛑',
              'Overdue: Showroom has partner visits pending in this cycle.',
              'individual',
              mgr.user_id::text,
              '/hierarchy',
              now()
            );
          END IF;
        END LOOP;

      -- Escalation: After Day 15 (Manager Escalation)
      ELSIF days_since_visit >= 16.0 THEN
        FOR mgr IN 
          SELECT user_id FROM public.user_roles 
          WHERE showroom_id = rec.showroom_id AND role = 'manager' AND is_active = true
        LOOP
          IF NOT EXISTS (
            SELECT 1 FROM public.scheduled_notifications 
            WHERE target_type = 'individual' AND target_id = mgr.user_id::text 
              AND title = 'Escalation: Partner Neglected 🛑' AND body LIKE '%' || rec.partner_name || '%' AND created_at >= now() - interval '48 hours'
          ) THEN
            INSERT INTO public.scheduled_notifications (title, body, target_type, target_id, target_url, scheduled_for)
            VALUES (
              'Escalation: Partner Neglected 🛑',
              'Escalation: Mapped partner ' || rec.partner_name || ' has not been visited for 15+ days.',
              'individual',
              mgr.user_id::text,
              '/hierarchy',
              now()
            );
          END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Function to check weekly performance updates (Runs every Monday morning)
CREATE OR REPLACE FUNCTION public.check_and_trigger_weekly_alerts()
RETURNS void AS $$
DECLARE
  rec RECORD;
  tl_rec RECORD;
  weekly_clients INT;
  weekly_wos INT;
  weekly_visits INT;
  
  team_visits INT;
  team_clients INT;
  team_wos INT;
  team_active_execs INT;
  team_avg_visits NUMERIC;
  status_label TEXT;
BEGIN
  -- ─────────────────────────────────────────────────────────────
  -- A. EXECUTIVE WEEKLY ANOMALIES & PROGRESS REPORTS
  -- ─────────────────────────────────────────────────────────────
  FOR rec IN
    SELECT 
      ur.user_id,
      ur.reports_to,
      ur.showroom_id,
      p.full_name AS employee_name
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'executive' AND ur.is_active = true
  LOOP
    -- Count last 7 days stats
    SELECT COUNT(*) INTO weekly_clients FROM public.clients WHERE created_by = rec.user_id AND created_at >= now() - interval '7 days';
    SELECT COUNT(*) INTO weekly_wos FROM public.work_scope_items WHERE created_by = rec.user_id AND created_at >= now() - interval '7 days';
    SELECT COUNT(*) INTO weekly_visits FROM public.visits WHERE created_by = rec.user_id AND status = 'done' AND visit_date >= (now() - interval '7 days')::date;

    -- Determine weekly progress status label
    IF (weekly_visits::numeric / 7.0) < 2.0 OR weekly_clients <= 2 OR weekly_wos <= 3 THEN
      status_label := 'Red';
    ELSIF (weekly_visits::numeric / 7.0) < 2.5 OR weekly_clients = 3 OR weekly_wos <= 5 THEN
      status_label := 'Yellow';
    ELSE
      status_label := 'Green';
    END IF;

    -- 1. Weekly Low client addition warning (0-2 additions)
    IF weekly_clients <= 2 THEN
      INSERT INTO public.scheduled_notifications (title, body, target_type, target_id, target_url, scheduled_for)
      VALUES (
        'Low Client Addition Alert 📈',
        'Client addition is low this week. Please register new client opportunities.',
        'individual',
        rec.user_id::text,
        '/',
        now()
      );
    END IF;

    -- 2. Weekly Low workscope addition warning (0-3 additions)
    IF weekly_wos <= 3 THEN
      INSERT INTO public.scheduled_notifications (title, body, target_type, target_id, target_url, scheduled_for)
      VALUES (
        'Low Workscope Addition Alert 📋',
        'Work scope addition is low. Please update pending opportunities.',
        'individual',
        rec.user_id::text,
        '/',
        now()
      );
    END IF;

    -- 3. Weekly Progress Report to Executive
    INSERT INTO public.scheduled_notifications (title, body, target_type, target_id, target_url, scheduled_for)
    VALUES (
      'Your Weekly Progress Report 📊',
      'Visits: ' || weekly_visits || ', Clients Added: ' || weekly_clients || ', Workscope Added: ' || weekly_wos || ', Status: ' || status_label || '.',
      'individual',
      rec.user_id::text,
      '/reports',
      now()
    );
  END LOOP;

  -- ─────────────────────────────────────────────────────────────
  -- B. TEAM LEADER WEEKLY PROGRESS REPORTS (Rollup of team)
  -- ─────────────────────────────────────────────────────────────
  FOR tl_rec IN
    SELECT 
      ur.user_id,
      ur.showroom_id
    FROM public.user_roles ur
    WHERE ur.role = 'tl' AND ur.is_active = true
  LOOP
    -- Aggregate team stats (executives reporting to this TL)
    SELECT 
      COALESCE(COUNT(DISTINCT v.id), 0),
      COALESCE(COUNT(DISTINCT c.id), 0),
      COALESCE(COUNT(DISTINCT w.id), 0),
      COALESCE(COUNT(DISTINCT ex.user_id), 0)
    INTO team_visits, team_clients, team_wos, team_active_execs
    FROM public.user_roles ex
    LEFT JOIN public.visits v ON v.created_by = ex.user_id AND v.status = 'done' AND v.visit_date >= (now() - interval '7 days')::date
    LEFT JOIN public.clients c ON c.created_by = ex.user_id AND c.created_at >= now() - interval '7 days'
    LEFT JOIN public.work_scope_items w ON w.created_by = ex.user_id AND w.created_at >= now() - interval '7 days'
    WHERE ex.reports_to = tl_rec.user_id AND ex.role = 'executive' AND ex.is_active = true;

    IF team_active_execs > 0 THEN
      team_avg_visits := ROUND((team_visits::numeric / (team_active_execs::numeric * 7.0)), 1);
    ELSE
      team_avg_visits := 0.0;
    END IF;

    -- Send Weekly Progress Report to TL
    INSERT INTO public.scheduled_notifications (title, body, target_type, target_id, target_url, scheduled_for)
    VALUES (
      'Team Weekly Progress Report 📊',
      'Total Visits: ' || team_visits || ', Avg Visit: ' || team_avg_visits || '/person/day, Clients Added: ' || team_clients || ', Workscope Added: ' || team_wos || '.',
      'individual',
      tl_rec.user_id::text,
      '/hierarchy',
      now()
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Schedule cron tasks for automated triggers
-- Run daily checks (inactivity + partner visits) every morning at 3:45 AM UTC (9:15 AM IST)
DO $$ BEGIN PERFORM cron.unschedule('daily-system-alerts'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'daily-system-alerts',
  '45 3 * * *',
  'SELECT public.check_and_trigger_daily_alerts();'
);

-- Run weekly checks (low client/workscope + weekly reports) every Monday morning at 4:00 AM UTC (9:30 AM IST)
DO $$ BEGIN PERFORM cron.unschedule('weekly-system-alerts'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'weekly-system-alerts',
  '0 4 * * 1',
  'SELECT public.check_and_trigger_weekly_alerts();'
);
