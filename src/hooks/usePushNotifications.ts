import { useEffect } from "react";
import { PushNotifications, Token, ActionPerformed } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

export const usePushNotifications = (userId: string | undefined) => {
  const navigate = useNavigate();

  useEffect(() => {
    // Only run on native platforms (Android/iOS) when a user is logged in
    if (!userId || !Capacitor.isNativePlatform()) {
      return;
    }

    const registerPush = async () => {
      try {
        // Request permissions (prompt will trigger on iOS, and Android 13+)
        const permStatus = await PushNotifications.requestPermissions();
        
        if (permStatus.receive === "granted") {
          // Register device with Apple / Google to get token
          await PushNotifications.register();
        } else {
          console.warn("Push notification permission was denied");
        }
      } catch (err) {
        console.error("Error requesting push notification permissions:", err);
      }
    };

    registerPush();

    // Listener for successful registration
    const registrationListener = PushNotifications.addListener(
      "registration",
      async (token: Token) => {
        console.log("FCM registration success, token:", token.value);
        
        // Save FCM token to public.user_fcm_tokens table
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

    // Listener for registration errors
    const registrationErrorListener = PushNotifications.addListener(
      "registrationError",
      (error: any) => {
        console.error("FCM registration error:", JSON.stringify(error));
      }
    );

    // Listener for notifications received while app is in foreground
    const notificationReceivedListener = PushNotifications.addListener(
      "pushNotificationReceived",
      (notification) => {
        console.log("Push notification received in foreground:", notification);
        // We can display a custom UI Toast or banner inside the app here
      }
    );

    // Listener for actions performed (user clicks on notification)
    const actionPerformedListener = PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action: ActionPerformed) => {
        console.log("Push notification action performed:", action);
        const targetUrl = action.notification.data?.targetUrl;
        if (targetUrl) {
          console.log("Navigating to targetUrl:", targetUrl);
          navigate(targetUrl);
        }
      }
    );

    // Cleanup listeners on unmount
    return () => {
      registrationListener.remove();
      registrationErrorListener.remove();
      notificationReceivedListener.remove();
      actionPerformedListener.remove();
    };
  }, [userId, navigate]);
};
