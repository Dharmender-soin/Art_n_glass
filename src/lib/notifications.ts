import { supabase } from "@/integrations/supabase/client";
import { buildNotificationDeepLink } from "./notificationDeepLinks";

export type NotificationCategory = "critical" | "important" | "report" | "reminder" | "informational";
export type NotificationPriority = "high" | "medium" | "normal" | "low";

export interface CategoryMetadata {
  label: string;
  badgeBg: string;
  badgeText: string;
  border: string;
  icon: string;
  priorityDot: string;
  defaultChannelId: string;
}

export const CATEGORY_META: Record<NotificationCategory, CategoryMetadata> = {
  critical: {
    label: "Critical",
    badgeBg: "bg-rose-500/15 dark:bg-rose-950/40",
    badgeText: "text-rose-600 dark:text-rose-400 font-extrabold",
    border: "border-rose-500/30",
    icon: "🔴",
    priorityDot: "bg-rose-600 shadow-[0_0_8px_#e11d48]",
    defaultChannelId: "critical_alerts",
  },
  important: {
    label: "Important",
    badgeBg: "bg-amber-500/15 dark:bg-amber-950/40",
    badgeText: "text-amber-600 dark:text-amber-400 font-bold",
    border: "border-amber-500/30",
    icon: "🟠",
    priorityDot: "bg-amber-500 shadow-[0_0_6px_#f59e0b]",
    defaultChannelId: "important_alerts",
  },
  report: {
    label: "Report",
    badgeBg: "bg-blue-500/15 dark:bg-blue-950/40",
    badgeText: "text-blue-600 dark:text-blue-400 font-bold",
    border: "border-blue-500/30",
    icon: "🔵",
    priorityDot: "bg-blue-500",
    defaultChannelId: "reports",
  },
  reminder: {
    label: "Reminder",
    badgeBg: "bg-yellow-500/15 dark:bg-yellow-950/40",
    badgeText: "text-yellow-600 dark:text-yellow-400 font-bold",
    border: "border-yellow-500/30",
    icon: "🟡",
    priorityDot: "bg-yellow-500",
    defaultChannelId: "reminders",
  },
  informational: {
    label: "Informational",
    badgeBg: "bg-slate-500/15 dark:bg-slate-800/40",
    badgeText: "text-slate-600 dark:text-slate-300 font-medium",
    border: "border-slate-500/20",
    icon: "⚪",
    priorityDot: "bg-slate-400",
    defaultChannelId: "informational",
  },
};

export interface SendNotificationParams {
  userId: string;
  title: string;
  message: string;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  notificationType?: string;
  targetUrl?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
  /** Stable user/campaign/date key used by the backend to block duplicate dispatches. */
  dedupeKey?: string;
}

/**
 * Sends Database Persistence (Bell 🔔 icon & Notification Center),
 * triggers Native Mobile Status Bar Popup (via Capacitor LocalNotifications on phone),
 * and invokes backend Edge Function to dispatch FCM Push.
 */
export const sendNotification = async ({
  userId,
  title,
  message,
  category = "informational",
  priority = "normal",
  notificationType = "general",
  targetUrl,
  entityType,
  entityId,
  metadata = {},
  dedupeKey,
}: SendNotificationParams) => {
  const deepLink = targetUrl || buildNotificationDeepLink(notificationType, metadata);

  // The backend is the single source of truth for Bell history and FCM.
  // Scheduling a second LocalNotification here caused the same phone to show
  // one local alert plus one FCM alert for a single campaign.
  try {
    const { error } = await supabase.functions.invoke("send-push-notification", {
      body: {
        userId,
        title,
        body: message,
        category,
        priority,
        data: { targetUrl: deepLink, notificationType, category, entityType, entityId, metadata },
        persistInApp: true,
        dedupeKey,
      },
    });
    if (error) throw error;
  } catch (fcmErr) {
    console.warn("Edge function push invoke error:", fcmErr);
    // Keep an in-app fallback when the push service is temporarily unavailable.
    // This does not produce a phone popup, so it cannot duplicate a later FCM.
    await supabase.from("notifications" as any).insert({
      user_id: userId,
      title,
      message,
      body: message,
      category,
      priority,
      notification_type: notificationType,
      target_url: deepLink,
      deep_link: deepLink,
      entity_type: entityType || null,
      entity_id: entityId || null,
      metadata: { ...(metadata || {}), push_failed: true, dedupe_key: dedupeKey || null },
      is_read: false,
      created_at: new Date().toISOString(),
    });
  }
};

/**
 * Sends notification to ALL Managing Directors & Admins
 */
export const notifyAllMDs = async ({
  title,
  message,
  category = "important",
  priority = "normal",
  notificationType = "general",
  targetUrl,
  entityType,
  entityId,
  metadata = {},
}: Omit<SendNotificationParams, "userId">) => {
  try {
    const { data: roles } = await supabase
      .from("user_roles" as any)
      .select("user_id")
      .in("role", ["md", "admin"]);

    let mdUserIds = [...new Set((roles || []).map((r: any) => r.user_id))];

    // Never fall back to arbitrary profiles: a management alert must only
    // reach users explicitly assigned the MD or Admin role.
    if (mdUserIds.length === 0) {
      console.warn("No MD/Admin recipients found for management notification.");
      return;
    }

    for (const uid of mdUserIds) {
      await sendNotification({
        userId: uid,
        title,
        message,
        category,
        priority,
        notificationType,
        targetUrl,
        entityType,
        entityId,
        metadata,
      });
    }
  } catch (err) {
    console.error("Error notifying MDs:", err);
  }
};
