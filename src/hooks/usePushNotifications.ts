import { useEffect } from "react";
import { PushNotifications, Token, ActionPerformed } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export const usePushNotifications = (userId: string | undefined) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!userId) return;

    // --- 1. WEB & IN-APP REALTIME NOTIFICATIONS ---
    const channel = supabase
      .channel(`realtime-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notif = payload.new;
          const title = notif.title || "New Notification";
          const message = notif.message || notif.body || "";

          // Show Toast inside App UI
          toast(title, {
            description: message,
            action: notif.target_url ? {
              label: "View",
              onClick: () => navigate(notif.target_url)
            } : undefined
          });

          // Show HTML5 Notification if browser supports it
          if (!Capacitor.isNativePlatform() && "Notification" in window && Notification.permission === "granted") {
            try {
              const webNotif = new Notification(title, {
                body: message,
                icon: "/favicon.ico",
              });
              if (notif.target_url) {
                webNotif.onclick = () => {
                  window.focus();
                  navigate(notif.target_url);
                };
              }
            } catch (err) {
              console.error("Web notification error:", err);
            }
          }
        }
      )
      .subscribe();

    // Request Web Notification permission
    if (!Capacitor.isNativePlatform() && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch((err) =>
        console.error("Web notification permission error:", err)
      );
    }

    // --- 2. NATIVE PLATFORMS (Android / iOS via Capacitor Push Notifications) ---
    if (Capacitor.isNativePlatform()) {
      const registerPush = async () => {
        try {
          const permStatus = await PushNotifications.requestPermissions();
          if (permStatus.receive === "granted") {
            // Create MAX Importance Android Channel for Status Bar Popups & Sound
            if (Capacitor.getPlatform() === "android") {
              await PushNotifications.createChannel({
                id: "default",
                name: "High Priority Notifications",
                description: "Critical status alerts and MD updates",
                importance: 5, // MAX importance (Heads-Up status bar banner)
                visibility: 1, // Visible on Lock Screen
                vibration: true,
                lights: true,
                lightColor: "#DC2626",
              });
            }
            await PushNotifications.register();
          } else {
            console.warn("Push notification permission was denied");
          }
        } catch (err) {
          console.error("Error requesting push notification permissions:", err);
        }
      };

      registerPush();

      const registrationListener = PushNotifications.addListener(
        "registration",
        async (token: Token) => {
          console.log("FCM registration success, token:", token.value);
          const { error } = await supabase
            .from("user_fcm_tokens" as any)
            .upsert(
              {
                user_id: userId,
                token: token.value,
                device_platform: Capacitor.getPlatform(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "token" }
            );

          if (error) {
            console.error("Failed to save FCM token to Supabase:", error.message);
          } else {
            console.log("FCM token saved to Supabase successfully.");
          }
        }
      );

      const registrationErrorListener = PushNotifications.addListener(
        "registrationError",
        (error: any) => {
          console.error("FCM registration error:", JSON.stringify(error));
        }
      );

      const notificationReceivedListener = PushNotifications.addListener(
        "pushNotificationReceived",
        (notification) => {
          console.log("Push notification received in foreground:", notification);
          toast(notification.title || "Notification Received", {
            description: notification.body || "",
            action: notification.data?.targetUrl ? {
              label: "Open",
              onClick: () => navigate(notification.data.targetUrl)
            } : undefined
          });
        }
      );

      const actionPerformedListener = PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action: ActionPerformed) => {
          console.log("Push notification action performed:", action);
          const targetUrl = action.notification.data?.targetUrl;
          if (targetUrl) {
            navigate(targetUrl);
          }
        }
      );

      return () => {
        supabase.removeChannel(channel);
        registrationListener.then((h) => h.remove());
        registrationErrorListener.then((h) => h.remove());
        notificationReceivedListener.then((h) => h.remove());
        actionPerformedListener.then((h) => h.remove());
      };
    }

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, navigate]);
};
