import { useEffect } from "react";
import { PushNotifications, Token, ActionPerformed } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

export const usePushNotifications = (userId: string | undefined) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!userId) return;

    // --- 1. WEB BROWSER NOTIFICATIONS (HTML5 + Supabase Realtime) ---
    if (!Capacitor.isNativePlatform()) {
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch((err) =>
          console.error("Web notification permission request error:", err)
        );
      }

      // Realtime listener for incoming notifications for this user on Web
      const channel = supabase
        .channel(`web-notifications-${userId}`)
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
            if ("Notification" in window && Notification.permission === "granted") {
              const webNotif = new Notification(notif.title || "New Notification", {
                body: notif.message || notif.body || "",
                icon: "/favicon.ico",
              });
              if (notif.target_url) {
                webNotif.onclick = () => {
                  window.focus();
                  navigate(notif.target_url);
                };
              }
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }

    // --- 2. NATIVE PLATFORMS (Android / iOS via Capacitor FCM) ---
    const registerPush = async () => {
      try {
        const permStatus = await PushNotifications.requestPermissions();
        if (permStatus.receive === "granted") {
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
          .from("user_fcm_tokens")
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
      registrationListener.then((h) => h.remove());
      registrationErrorListener.then((h) => h.remove());
      notificationReceivedListener.then((h) => h.remove());
      actionPerformedListener.then((h) => h.remove());
    };
  }, [userId, navigate]);
};
