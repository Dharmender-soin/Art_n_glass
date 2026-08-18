import { supabase } from "@/integrations/supabase/client";

/** Record an in-app/bell open against every device delivery for this dispatch. */
export async function recordNotificationOpened(notification: any, userId?: string) {
  if (!userId) return;
  const now = new Date().toISOString();

  if (notification?.dispatch_id) {
    const { error } = await supabase
      .from("notification_delivery_logs" as any)
      .update({ status: "opened", opened_at: now })
      .eq("dispatch_id", notification.dispatch_id)
      .eq("user_id", userId);
    if (!error) return;
    console.warn("Unable to link bell open to delivery log:", error.message);
  }

  // Older notification rows predate dispatch_id. Keep the bell state as the
  // reliable fallback instead of failing the user's navigation.
  if (notification?.id) {
    await supabase
      .from("notifications" as any)
      .update({ is_read: true })
      .eq("id", notification.id)
      .eq("user_id", userId);
  }
}
