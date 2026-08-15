import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  triggerMorningSalesPlanReport,
  triggerDailyBusinessSummaryReport,
  triggerEODDSRReport,
  triggerStartDayReminder,
} from "@/lib/scheduledReportGenerator";
import { sendNotification } from "@/lib/notifications";
import { format } from "date-fns";

export function useScheduledNotifications() {
  const { role, user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const checkAndTriggerScheduledReports = async () => {
      const now = new Date();
      const todayStr = format(now, "yyyy-MM-dd");
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();

      // Load saved custom report timings
      let morningTime = "08:30";
      let summaryTime = "19:00";
      let dsrTime = "20:00";

      try {
        const localSettings = localStorage.getItem("admin_notification_settings");
        if (localSettings) {
          const parsed = JSON.parse(localSettings);
          if (parsed.timings?.morning_plan_time) morningTime = parsed.timings.morning_plan_time;
          if (parsed.timings?.daily_summary_time) summaryTime = parsed.timings.daily_summary_time;
          if (parsed.timings?.dsr_report_time) dsrTime = parsed.timings.dsr_report_time;
        }
      } catch (err) {
        console.warn("Could not load local report timings:", err);
      }

      const parseTime = (timeStr: string) => {
        const parts = timeStr.split(":");
        return {
          h: parseInt(parts[0] || "8", 10),
          m: parseInt(parts[1] || "0", 10),
        };
      };

      const mTime = parseTime(morningTime);
      const sTime = parseTime(summaryTime);
      const dTime = parseTime(dsrTime);

      /* ── 1. MD & Admin Daily Scheduled Reports ── */
      if (role === "admin" || role === "md") {
        // Morning Sales Plan
        const morningKey = `morning_plan_sent_${todayStr}`;
        if (
          (currentHours > mTime.h || (currentHours === mTime.h && currentMinutes >= mTime.m)) &&
          !localStorage.getItem(morningKey)
        ) {
          localStorage.setItem(morningKey, "true");
          await triggerMorningSalesPlanReport();
        }

        // Daily Business Summary
        const summaryKey = `daily_summary_sent_${todayStr}`;
        if (
          (currentHours > sTime.h || (currentHours === sTime.h && currentMinutes >= sTime.m)) &&
          !localStorage.getItem(summaryKey)
        ) {
          localStorage.setItem(summaryKey, "true");
          await triggerDailyBusinessSummaryReport();
        }

        // EOD DSR Report
        const dsrKey = `dsr_report_sent_${todayStr}`;
        if (
          (currentHours > dTime.h || (currentHours === dTime.h && currentMinutes >= dTime.m)) &&
          !localStorage.getItem(dsrKey)
        ) {
          localStorage.setItem(dsrKey, "true");
          await triggerEODDSRReport();
        }
      }

      /* ── 2. Executive Role Scheduled Notifications (Target Visits & Partner Condition Meetings) ── */
      if (role === "executive" || (role as string) === "backhand_executive") {
        // Today's Planned Visits (08:30 AM)
        const execVisitKey = `exec_visit_alert_${todayStr}_${user.id}`;
        if (currentHours === 8 && currentMinutes >= 30 && !localStorage.getItem(execVisitKey)) {
          localStorage.setItem(execVisitKey, "true");
          
          const { count } = await supabase
            .from("visits")
            .select("id", { count: "exact", head: true })
            .eq("created_by", user.id)
            .eq("visit_date", todayStr);

          await sendNotification({
            userId: user.id,
            title: "🌅 Today's Target Visit List",
            message: `Good Morning! You have ${count || 0} planned visits scheduled for today. Tap to check client routes!`,
            category: "reminder",
            priority: "high",
            targetUrl: "/visits",
          });
        }

        // 🤝 Partner Condition & Architect Meeting Alert (09:00 AM)
        const partnerKey = `exec_partner_alert_${todayStr}_${user.id}`;
        if (currentHours === 9 && currentMinutes >= 0 && !localStorage.getItem(partnerKey)) {
          localStorage.setItem(partnerKey, "true");

          const { data: overduePartners } = await supabase
            .from("partners" as any)
            .select("name")
            .eq("created_by", user.id)
            .limit(3);

          const partnerNames = (overduePartners || []).map((p: any) => p.name).join(", ");
          
          await sendNotification({
            userId: user.id,
            title: "🤝 Partner & Architect Condition Meeting Reminder",
            message: `Architect Follow-up: Schedule today's condition meeting with key partners${partnerNames ? `: ${partnerNames}` : ""}. Tap to open Partner CRM!`,
            category: "reminder",
            priority: "high",
            targetUrl: "/partners",
          });
        }
      }

      /* ── 3. Showroom Manager & Team Lead Scheduled Notifications ── */
      if (role === "manager" || role === "tl") {
        // Team Morning Digest (08:45 AM)
        const tlDigestKey = `tl_digest_${todayStr}_${user.id}`;
        if (currentHours === 8 && currentMinutes >= 45 && !localStorage.getItem(tlDigestKey)) {
          localStorage.setItem(tlDigestKey, "true");

          await sendNotification({
            userId: user.id,
            title: "👥 Team Morning Plan Digest",
            message: `Team Update: Team executives have scheduled visits for today. Tap to monitor team route compliance!`,
            category: "report",
            priority: "normal",
            targetUrl: "/reports",
          });
        }

        // Showroom DSR Summary (07:30 PM)
        const mgrDsrKey = `mgr_dsr_${todayStr}_${user.id}`;
        if (currentHours === 19 && currentMinutes >= 30 && !localStorage.getItem(mgrDsrKey)) {
          localStorage.setItem(mgrDsrKey, "true");

          await sendNotification({
            userId: user.id,
            title: "🌆 Showroom DSR Submission Summary",
            message: `DSR Review: Check team visit submissions and pending WOS approvals for today.`,
            category: "report",
            priority: "high",
            targetUrl: "/reports",
          });
        }
      }

      /* ── 4. ☀️ Start Day Reminder at 09:30 AM (Sent to All Staff EXCEPT MD & Admin) ── */
      if (role !== "md" && role !== "admin") {
        const startDayKey = `start_day_sent_${todayStr}_${user.id}`;
        if (currentHours === 9 && currentMinutes >= 30 && !localStorage.getItem(startDayKey)) {
          localStorage.setItem(startDayKey, "true");
          await triggerStartDayReminder();
        }
      }
    };

    // Check immediately on mount
    checkAndTriggerScheduledReports();

    // Check every 60 seconds
    const interval = setInterval(checkAndTriggerScheduledReports, 60000);
    return () => clearInterval(interval);
  }, [role, user]);
}
