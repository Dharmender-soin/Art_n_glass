import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  triggerMorningSalesPlanReport,
  triggerDailyBusinessSummaryReport,
  triggerEODDSRReport,
} from "@/lib/scheduledReportGenerator";
import { format } from "date-fns";

export function useScheduledNotifications() {
  const { role, user } = useAuth();

  useEffect(() => {
    // Only run scheduled notification triggers for Admin or MD users
    if (!user || (role !== "admin" && role !== "md")) return;

    const checkAndTriggerScheduledReports = async () => {
      const now = new Date();
      const todayStr = format(now, "yyyy-MM-dd");
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();

      // Fetch dynamic saved timings from DB
      let morningTime = "08:30";
      let summaryTime = "19:00";
      let dsrTime = "20:00";

      try {
        const { data: dbSettings } = await supabase
          .from("notification_settings" as any)
          .select("key, value")
          .in("key", ["morning_plan_time", "daily_summary_time", "dsr_report_time"]);

        if (dbSettings) {
          dbSettings.forEach((setting: any) => {
            if (setting.key === "morning_plan_time" && setting.value) morningTime = setting.value;
            if (setting.key === "daily_summary_time" && setting.value) summaryTime = setting.value;
            if (setting.key === "dsr_report_time" && setting.value) dsrTime = setting.value;
          });
        }
      } catch (err) {
        console.warn("Could not load custom report timings from DB, using defaults:", err);
      }

      // Parse HH:MM helper
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

      // 1. Morning Sales Plan
      const morningKey = `morning_plan_sent_${todayStr}`;
      if (
        (currentHours > mTime.h || (currentHours === mTime.h && currentMinutes >= mTime.m)) &&
        !localStorage.getItem(morningKey)
      ) {
        console.log(`⏰ Auto-triggering Morning Sales Plan Report for MDs (Target Time: ${morningTime})...`);
        localStorage.setItem(morningKey, "true");
        await triggerMorningSalesPlanReport();
      }

      // 2. Daily Business Summary
      const summaryKey = `daily_summary_sent_${todayStr}`;
      if (
        (currentHours > sTime.h || (currentHours === sTime.h && currentMinutes >= sTime.m)) &&
        !localStorage.getItem(summaryKey)
      ) {
        console.log(`⏰ Auto-triggering Daily Business Summary Report for MDs (Target Time: ${summaryTime})...`);
        localStorage.setItem(summaryKey, "true");
        await triggerDailyBusinessSummaryReport();
      }

      // 3. EOD DSR Report
      const dsrKey = `dsr_report_sent_${todayStr}`;
      if (
        (currentHours > dTime.h || (currentHours === dTime.h && currentMinutes >= dTime.m)) &&
        !localStorage.getItem(dsrKey)
      ) {
        console.log(`⏰ Auto-triggering EOD DSR Report for MDs (Target Time: ${dsrTime})...`);
        localStorage.setItem(dsrKey, "true");
        await triggerEODDSRReport();
      }
    };

    // Run check immediately on mount
    checkAndTriggerScheduledReports();

    // Check every 60 seconds
    const interval = setInterval(checkAndTriggerScheduledReports, 60000);
    return () => clearInterval(interval);
  }, [role, user]);
}
