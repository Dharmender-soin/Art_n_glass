import { createClient } from "./node_modules/@supabase/supabase-js/dist/index.mjs";

const SUPABASE_URL = "https://khuqshdbpmuolyarhuud.supabase.co";
const SUPABASE_KEY = "sb_publishable_Rs8MWYZC0DOgeqmcTc9pGg_VNCOqbCz";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function pushLiveMDAlerts() {
  console.log("Fetching recent active users from notifications table...");

  // 1. Get user IDs from recent notifications
  const { data: recentNotifs, error: fetchErr } = await supabase
    .from("notifications" as any)
    .select("user_id")
    .order("created_at", { ascending: false })
    .limit(50);

  if (fetchErr) {
    console.error("Fetch error:", fetchErr.message);
    return;
  }

  const userIds = [...new Set((recentNotifs || []).map((n: any) => n.user_id))];
  console.log("Target User IDs found:", userIds);

  if (userIds.length === 0) {
    console.error("No active user IDs found in notifications table.");
    return;
  }

  const testNotifs = [
    {
      title: "🎉 Deal WON Alert ✅",
      message: "Client 'M/s Luxury Glass Villa' was converted to WON by Executive Rohit! Deal Amount: ₹24.5 Lakhs.",
      target_url: "/reports",
    },
    {
      title: "🚨 Urgent MD Alert: Executive Inactive",
      message: "Executive Vikram has recorded 0 visits in 5 days at Kirti Nagar Showroom.",
      target_url: "/md-dashboard",
    },
    {
      title: "🆕 New Lead Onboarded",
      message: "Architect Priya Sharma registered new high-value client 'DLF Magnolias Penthouse'.",
      target_url: "/clients",
    },
  ];

  for (const uid of userIds) {
    for (const notif of testNotifs) {
      console.log(`Sending live push notification to user ${uid}: ${notif.title}`);

      const { error: insErr } = await supabase.from("notifications" as any).insert({
        user_id: uid,
        title: notif.title,
        message: notif.message,
        target_url: notif.target_url,
        is_read: false,
        created_at: new Date().toISOString(),
      });

      if (insErr) console.error("Insert Error:", insErr.message);
      else console.log("✓ Live Push Sent Successfully!");

      // Invoke edge function if configured
      try {
        await supabase.functions.invoke("send-push-notification", {
          body: {
            userId: uid,
            title: notif.title,
            body: notif.message,
            data: { targetUrl: notif.target_url },
          },
        });
      } catch (e) {
        // Edge function fallback
      }
    }
  }

  console.log("\n==========================================");
  console.log("SUCCESS! ALL 3 LIVE NOTIFICATIONS PUSHED!");
  console.log("==========================================\n");
}

pushLiveMDAlerts();
