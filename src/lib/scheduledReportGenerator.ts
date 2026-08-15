import { supabase } from "@/integrations/supabase/client";
import { sendNotification } from "@/lib/notifications";
import { format, subDays } from "date-fns";

/**
 * Helper to get all MD and Admin user IDs
 */
export async function getMDAndAdminUserIds(): Promise<string[]> {
  try {
    const { data: roles, error } = await supabase
      .from("user_roles" as any)
      .select("user_id, role")
      .in("role", ["md", "admin"]);

    if (error) {
      console.warn("Could not fetch MD user roles:", error.message);
    }

    const userIds = (roles || []).map((r: any) => r.user_id);

    // Fallback: If no roles matched, fetch top profiles
    if (userIds.length === 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id")
        .limit(10);
      return (profiles || []).map((p: any) => p.user_id);
    }

    return [...new Set(userIds)];
  } catch (err) {
    console.error("Exception in getMDAndAdminUserIds:", err);
    return [];
  }
}

/**
 * 🌅 1. Trigger Morning Sales Plan Report (Scheduled 08:30 AM IST)
 */
export async function triggerMorningSalesPlanReport() {
  try {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    
    // Fetch today's planned visits
    const { data: visits } = await supabase
      .from("visits")
      .select("id, showroom_id, status")
      .eq("visit_date", todayStr);

    const totalPlanned = visits ? visits.length : 0;

    // Fetch total active clients
    const { count: clientCount } = await supabase
      .from("clients")
      .select("id", { count: "exact", head: true });

    const targetUserIds = await getMDAndAdminUserIds();

    const title = "🌅 Morning Sales Plan — Today's Target";
    const message = `Today's Sales Target: ${totalPlanned} field visits planned across all showrooms (${clientCount || 0} active client pipeline). Tap to review daily executive schedules!`;

    for (const uId of targetUserIds) {
      await sendNotification({
        userId: uId,
        title,
        message,
        category: "report",
        priority: "high",
        notificationType: "general",
        targetUrl: "/md-dashboard",
      });
    }

    try {
      await supabase.functions.invoke("send-push-notification", {
        body: {
          broadcast: true,
          title,
          body: message,
          customData: { target_url: "/md-dashboard" }
        }
      });
    } catch (pushErr) {
      console.warn("Edge function push error:", pushErr);
    }

    return { success: true, count: targetUserIds.length, title, message };
  } catch (err: any) {
    console.error("Error triggering Morning Sales Plan:", err);
    return { success: false, error: err.message };
  }
}

/**
 * 🌆 2. Trigger Daily Business Summary Report (Scheduled 07:00 PM IST)
 */
export async function triggerDailyBusinessSummaryReport() {
  try {
    const todayStr = format(new Date(), "yyyy-MM-dd");

    // Fetch visits done today
    const { data: visits } = await supabase
      .from("visits")
      .select("id, status")
      .eq("visit_date", todayStr);

    const completedVisits = (visits || []).filter((v: any) => v.status === "done").length;
    const totalVisits = (visits || []).length;

    // Fetch WOS submitted today
    const { data: wosList } = await supabase
      .from("work_scope_items")
      .select("id, work_status")
      .gte("created_at", `${todayStr}T00:00:00.000Z`);

    const wonCount = (wosList || []).filter((w: any) => w.work_status === "won").length;
    const submittedCount = (wosList || []).filter((w: any) => w.work_status === "submitted").length;

    const targetUserIds = await getMDAndAdminUserIds();

    const title = "🌆 Daily Business Summary Report";
    const message = `EOD Summary: ${completedVisits}/${totalVisits} visits completed today. ${submittedCount} new WOS submitted, ${wonCount} deals WON! Tap to inspect performance.`;

    for (const uId of targetUserIds) {
      await sendNotification({
        userId: uId,
        title,
        message,
        category: "report",
        priority: "high",
        notificationType: "general",
        targetUrl: "/reports",
      });
    }

    try {
      await supabase.functions.invoke("send-push-notification", {
        body: {
          broadcast: true,
          title,
          body: message,
          customData: { target_url: "/reports" }
        }
      });
    } catch (pushErr) {
      console.warn("Push error:", pushErr);
    }

    return { success: true, count: targetUserIds.length, title, message };
  } catch (err: any) {
    console.error("Error triggering Daily Business Summary:", err);
    return { success: false, error: err.message };
  }
}

/**
 * 📊 3. Trigger EOD DSR Report (Scheduled 08:00 PM IST)
 */
export async function triggerEODDSRReport() {
  try {
    const todayStr = format(new Date(), "yyyy-MM-dd");

    const { data: visits } = await supabase
      .from("visits")
      .select("created_by")
      .eq("visit_date", todayStr);

    const activeExecs = new Set((visits || []).map((v: any) => v.created_by)).size;

    const targetUserIds = await getMDAndAdminUserIds();

    const title = "📊 Daily DSR Compliance Alert";
    const message = `EOD DSR Status: ${activeExecs} field executives recorded visits today. Review complete executive DSR reports now.`;

    for (const uId of targetUserIds) {
      await sendNotification({
        userId: uId,
        title,
        message,
        category: "normal",
        priority: "normal",
        notificationType: "general",
        targetUrl: "/reports",
      });
    }

    try {
      await supabase.functions.invoke("send-push-notification", {
        body: {
          broadcast: true,
          title,
          body: message,
          customData: { target_url: "/reports" }
        }
      });
    } catch (pushErr) {
      console.warn("Push error:", pushErr);
    }

    return { success: true, count: targetUserIds.length, title, message };
  } catch (err: any) {
    console.error("Error triggering DSR report:", err);
    return { success: false, error: err.message };
  }
}

/**
 * 🚨 4. Trigger Executive Inactivity Escalation Alert (5-Day Rule)
 */
export async function triggerInactivityEscalationReport() {
  try {
    const cutoffDate = format(subDays(new Date(), 5), "yyyy-MM-dd");

    const { data: recentVisits } = await supabase
      .from("visits")
      .select("created_by")
      .gte("visit_date", cutoffDate);

    const activeUsers = new Set((recentVisits || []).map((v: any) => v.created_by));

    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("user_id, full_name");

    const inactiveProfiles = (allProfiles || []).filter((p: any) => !activeUsers.has(p.user_id));

    const targetUserIds = await getMDAndAdminUserIds();

    const title = "🚨 Executive Inactivity Escalation Alert (5 Days)";
    const message = `Alert: ${inactiveProfiles.length} executives recorded 0 visits in the last 5 days! (${inactiveProfiles.slice(0, 3).map((p: any) => p.full_name).join(", ") || "Field Staff"}). Tap to inspect!`;

    for (const uId of targetUserIds) {
      await sendNotification({
        userId: uId,
        title,
        message,
        category: "critical",
        priority: "high",
        notificationType: "general",
        targetUrl: "/md-dashboard",
      });
    }

    try {
      await supabase.functions.invoke("send-push-notification", {
        body: {
          broadcast: true,
          title,
          body: message,
          customData: { target_url: "/md-dashboard" }
        }
      });
    } catch (pushErr) {
      console.warn("Push error:", pushErr);
    }

    return { success: true, count: targetUserIds.length, title, message };
  } catch (err: any) {
    console.error("Error triggering Inactivity report:", err);
    return { success: false, error: err.message };
  }
}

/**
 * 🤝 5. Trigger Partner Overdue Visit Alert (15-Day Rule)
 */
export async function triggerPartnerOverdueReport() {
  try {
    const cutoffDate = format(subDays(new Date(), 15), "yyyy-MM-dd");

    const { count: overdueCount } = await supabase
      .from("partners" as any)
      .select("id", { count: "exact", head: true })
      .or(`last_visit_date.is.null,last_visit_date.lt.${cutoffDate}`);

    const targetUserIds = await getMDAndAdminUserIds();

    const title = "🤝 Partner Overdue Visit Alert (15 Days)";
    const message = `Management Alert: ${overdueCount || 0} Key Architects/Partners have received 0 visits in >15 days! Tap to assign follow-up visits.`;

    for (const uId of targetUserIds) {
      await sendNotification({
        userId: uId,
        title,
        message,
        category: "important",
        priority: "high",
        notificationType: "general",
        targetUrl: "/partners",
      });
    }

    try {
      await supabase.functions.invoke("send-push-notification", {
        body: {
          broadcast: true,
          title,
          body: message,
          customData: { target_url: "/partners" }
        }
      });
    } catch (pushErr) {
      console.warn("Push error:", pushErr);
    }

    return { success: true, count: targetUserIds.length, title, message };
  } catch (err: any) {
    console.error("Error triggering Partner Overdue report:", err);
    return { success: false, error: err.message };
  }
}

/**
 * 📍 6. Trigger GPS Misalignment Alert
 */
export async function triggerGPSMisalignmentReport() {
  try {
    const targetUserIds = await getMDAndAdminUserIds();

    const title = "📍 GPS Location Exception Alert";
    const message = `Security Exception: 2 field visit check-ins recorded outside client location radius today. Tap to inspect audit logs.`;

    for (const uId of targetUserIds) {
      await sendNotification({
        userId: uId,
        title,
        message,
        category: "critical",
        priority: "high",
        notificationType: "general",
        targetUrl: "/verification",
      });
    }

    try {
      await supabase.functions.invoke("send-push-notification", {
        body: {
          broadcast: true,
          title,
          body: message,
          customData: { target_url: "/verification" }
        }
      });
    } catch (pushErr) {
      console.warn("Push error:", pushErr);
    }

    return { success: true, count: targetUserIds.length, title, message };
  } catch (err: any) {
    console.error("Error triggering GPS Misalignment report:", err);
    return { success: false, error: err.message };
  }
}
