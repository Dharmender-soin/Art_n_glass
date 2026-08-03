import { supabase } from "@/integrations/supabase/client";

interface SendNotificationParams {
  userId: string;
  title: string;
  message: string;
  targetUrl?: string;
}

/**
 * Sends both In-App Notification (Bell 🔔 icon) and Mobile Push Notification (Phone Status Bar 📱)
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

    // 2. Invoke Supabase Edge Function to send Mobile FCM Push Notification
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
