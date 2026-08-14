import { createClient } from "./node_modules/@supabase/supabase-js/dist/index.mjs";

const SUPABASE_URL = "https://khuqshdbpmuolyarhuud.supabase.co";
const SUPABASE_KEY = "sb_publishable_Rs8MWYZC0DOgeqmcTc9pGg_VNCOqbCz";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testFCMLivePush() {
  console.log("\n==========================================");
  console.log("🚀 STARTING LIVE FCM & DATABASE PUSH TEST...");
  console.log("==========================================\n");

  // 1. Fetch saved FCM tokens from user_fcm_tokens table
  const { data: fcmTokens, error: fcmErr } = await supabase
    .from("user_fcm_tokens" as any)
    .select("*")
    .order("updated_at", { ascending: false });

  if (fcmErr) {
    console.error("FCM Tokens Query Error:", fcmErr.message);
  } else {
    console.log(`Found ${fcmTokens?.length || 0} registered FCM Device Tokens in database.`);
    if (fcmTokens && fcmTokens.length > 0) {
      console.log("Registered Devices:", fcmTokens.map((t: any) => ({
        user_id: t.user_id,
        platform: t.device_platform,
        updated_at: t.updated_at
      })));
    }
  }

  // 2. Fetch profiles
  const { data: profiles } = await supabase
    .from("profiles" as any)
    .select("user_id, full_name");

  console.log(`Found ${profiles?.length || 0} user profiles.`);

  // Prepare test push payload
  const testNotif = {
    title: "🚨 URGENT MD ALERT: Deal WON 🎉",
    message: "Client 'M/s High-Tech Glass Project' converted to WON for ₹35.0 Lakhs! App background push test.",
    target_url: "/md-dashboard"
  };

  // Target all user IDs found or fcm user IDs
  const targetUserIds = [
    ...new Set([
      ...(fcmTokens || []).map((t: any) => t.user_id),
      ...(profiles || []).map((p: any) => p.user_id)
    ])
  ];

  console.log("Targeting User IDs:", targetUserIds);

  for (const uid of targetUserIds) {
    console.log(`Pushing alert to User ID [${uid}]...`);

    // Insert into notifications table
    const { error: insErr } = await supabase.from("notifications" as any).insert({
      user_id: uid,
      title: testNotif.title,
      message: testNotif.message,
      target_url: testNotif.target_url,
      is_read: false,
      created_at: new Date().toISOString()
    });

    if (insErr) {
      console.error(`Insert failed for ${uid}:`, insErr.message);
    } else {
      console.log(`✓ Inserted into notifications table for ${uid}`);
    }

    // Invoke FCM Edge Function
    try {
      const { data: edgeRes, error: edgeErr } = await supabase.functions.invoke("send-push-notification", {
        body: {
          userId: uid,
          title: testNotif.title,
          body: testNotif.message,
          data: { targetUrl: testNotif.target_url }
        }
      });

      if (edgeErr) {
        console.warn(`Edge function invoke warning for ${uid}:`, edgeErr.message);
      } else {
        console.log(`✓ Edge Function FCM push invoked successfully for ${uid}`, edgeRes);
      }
    } catch (e: any) {
      console.warn("Edge function error:", e.message);
    }
  }

  console.log("\n==========================================");
  console.log("✅ TEST PUSH COMPLETED!");
  console.log("==========================================\n");
}

testFCMLivePush();
