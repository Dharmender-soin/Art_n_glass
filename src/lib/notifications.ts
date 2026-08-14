import { supabase } from "@/integrations/supabase/client";

interface SendNotificationParams {
  userId: string;
  title: string;
  message: string;
  targetUrl?: string;
}

/**
 * Sends both In-App Notification (Bell 🔔 icon) and Mobile Push Notification (Phone Status Bar 📱) to a specific user
 */
export const sendNotification = async ({
  userId,
  title,
  message,
  targetUrl,
}: SendNotificationParams) => {
  try {
    // 1. Insert In-App Notification for 🔔 Bell icon
    await supabase.from("notifications" as any).insert({
      user_id: userId,
      title,
      message,
      target_url: targetUrl || null,
    });

    // 2. Invoke Supabase Edge Function to send Mobile FCM Push Notification to Phone Status Bar
    await supabase.functions.invoke("send-push-notification", {
      body: {
        userId,
        title,
        body: message,
        data: { targetUrl: targetUrl || "" },
      },
    });
  } catch (err) {
    console.error("Error sending notification:", err);
  }
};

/**
 * Automatically sends Native Phone Push Notification (FCM Status Bar) + In-App Bell Alert to ALL MD & Admin users
 */
export const notifyAllMDs = async ({
  title,
  message,
  targetUrl,
}: {
  title: string;
  message: string;
  targetUrl?: string;
}) => {
  try {
    const { data: roles } = await supabase
      .from("user_roles" as any)
      .select("user_id")
      .in("role", ["md", "admin"]);

    const mdUserIds = [...new Set((roles || []).map((r: any) => r.user_id))];

    if (mdUserIds.length === 0) {
      // Fallback: If roles table is empty, query profiles
      const { data: profiles } = await supabase.from("profiles" as any).select("user_id");
      const pUserIds = (profiles || []).map((p: any) => p.user_id);
      for (const uid of pUserIds) {
        await sendNotification({ userId: uid, title, message, targetUrl });
      }
      return;
    }

    for (const uid of mdUserIds) {
      await sendNotification({
        userId: uid,
        title,
        message,
        targetUrl,
      });
    }
  } catch (err) {
    console.error("Error notifying MDs:", err);
  }
};
