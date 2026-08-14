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
}

/**
 * Sends both Database Persistence (Bell 🔔 icon & Notification Center)
 * and invokes backend Edge Function to dispatch Mobile FCM Push Banner
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
}: SendNotificationParams) => {
  try {
    const deepLink = targetUrl || buildNotificationDeepLink(notificationType, metadata);

    // 1. Database Persistence
    const { error: insErr } = await supabase.from("notifications" as any).insert({
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
      metadata: metadata || {},
      is_read: false,
      created_at: new Date().toISOString(),
    });

    if (insErr) {
      console.warn("DB insert notification warning:", insErr.message);
    }

    // 2. Invoke Supabase Edge Function to send Mobile FCM Push Banner
    await supabase.functions.invoke("send-push-notification", {
      body: {
        userId,
        title,
        body: message,
        category,
        priority,
        data: { targetUrl: deepLink, notificationType, category },
      },
    });
  } catch (err) {
    console.error("Error sending notification:", err);
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

    if (mdUserIds.length === 0) {
      const { data: profiles } = await supabase.from("profiles" as any).select("user_id").limit(10);
      mdUserIds = (profiles || []).map((p: any) => p.user_id);
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
