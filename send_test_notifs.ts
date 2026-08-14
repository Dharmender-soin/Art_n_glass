import { createClient } from "./node_modules/@supabase/supabase-js/dist/index.mjs";

const SUPABASE_URL = "https://khuqshdbpmuolyarhuud.supabase.co";
const SUPABASE_KEY = "sb_publishable_Rs8MWYZC0DOgeqmcTc9pGg_VNCOqbCz";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function pushMDTestNotifs() {
  console.log("Fetching all user profiles to send test notifications...");
  const { data: profiles, error } = await supabase.from("profiles").select("user_id, full_name");
  if (error) {
    console.error("Error fetching profiles:", error.message);
    return;
  }

  console.log(`Found ${profiles?.length || 0} user profiles.`);

  const testNotifs = [
    {
      title: "🎉 Deal WON Alert ✅",
      message: "Client 'M/s Luxury Glass Projects' was converted to WON by Executive Rohit! Amount: ₹18.5 Lakhs.",
      target_url: "/reports",
    },
    {
      title: "🚨 Urgent MD Alert: Inactive Executive",
      message: "Executive Anish has recorded 0 visits in 5 days at Zirakpur Showroom.",
      target_url: "/md-dashboard",
    },
    {
      title: "🆕 New Lead Onboarded",
      message: "Architect Sunita Verma registered new client 'Siri Fort Villa'.",
      target_url: "/clients",
    },
  ];

  for (const p of (profiles || [])) {
    for (const notif of testNotifs) {
      console.log(`Pushing notification to [${p.full_name || p.user_id}]: ${notif.title}`);
      const { error: insErr } = await supabase.from("notifications" as any).insert({
        user_id: p.user_id,
        title: notif.title,
        message: notif.message,
        target_url: notif.target_url,
        is_read: false,
      });

      if (insErr) console.error("Insert error:", insErr.message);
      else console.log("✓ Success!");
    }
  }

  console.log("\n==========================================");
  console.log("SUCCESS! ALL TEST NOTIFICATIONS PUSHED TO SUPABASE!");
  console.log("==========================================\n");
}

pushMDTestNotifs();
