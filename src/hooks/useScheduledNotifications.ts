import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
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
      const hours = now.getHours();
      const minutes = now.getMinutes();

      // 1. Morning Sales Plan at 08:30 AM
      const morningKey = `morning_plan_sent_${todayStr}`;
      if (hours === 8 && minutes >= 30 && !localStorage.getItem(morningKey)) {
        console.log("⏰ Auto-triggering Morning Sales Plan Report for MDs...");
        localStorage.setItem(morningKey, "true");
        await triggerMorningSalesPlanReport();
      }

      // 2. Daily Business Summary at 19:00 (07:00 PM)
      const summaryKey = `daily_summary_sent_${todayStr}`;
      if (hours === 19 && minutes >= 0 && !localStorage.getItem(summaryKey)) {
        console.log("⏰ Auto-triggering Daily Business Summary Report for MDs...");
        localStorage.setItem(summaryKey, "true");
        await triggerDailyBusinessSummaryReport();
      }

      // 3. EOD DSR Report at 20:00 (08:00 PM)
      const dsrKey = `dsr_report_sent_${todayStr}`;
      if (hours === 20 && minutes >= 0 && !localStorage.getItem(dsrKey)) {
        console.log("⏰ Auto-triggering EOD DSR Report for MDs...");
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
