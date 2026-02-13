import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get and delete ALL existing users (handle pagination)
    let page = 1;
    let allUsers: any[] = [];
    while (true) {
      const { data: { users } } = await adminClient.auth.admin.listUsers({ page, perPage: 100 });
      if (!users || users.length === 0) break;
      allUsers = allUsers.concat(users);
      page++;
    }
    
    const deleteResults = [];
    for (const user of allUsers) {
      const { error: delErr } = await adminClient.auth.admin.deleteUser(user.id);
      deleteResults.push({ id: user.id, email: user.email, error: delErr?.message || null });
    }

    // Clean up orphaned data
    await adminClient.from("user_roles").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await adminClient.from("profiles").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    const showrooms = {
      kirtiNagar: "d72b329b-2d97-4dc3-ba66-a0ea26a900f9",
      gurgaon: "465fa542-7234-467b-a650-5a03e2089879",
      zirakpur: "d13723e6-4040-4de2-93a9-6c38fbef4b38",
    };

    const usersToCreate = [
      { email: "admin@artnglassinc.com", full_name: "Admin User", role: "admin", showroom_id: showrooms.kirtiNagar },
      { email: "manager@artnglassinc.com", full_name: "Manager User", role: "manager", showroom_id: showrooms.gurgaon },
      { email: "executive@artnglassinc.com", full_name: "Executive User", role: "executive", showroom_id: showrooms.kirtiNagar },
    ];

    const results = [];

    for (const u of usersToCreate) {
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: u.email,
        password: "admin123",
        email_confirm: true,
        user_metadata: { full_name: u.full_name },
      });

      if (createError) {
        results.push({ email: u.email, error: createError.message });
        continue;
      }

      await adminClient.from("profiles").upsert({
        user_id: newUser.user.id,
        full_name: u.full_name,
      }, { onConflict: "user_id" });

      await adminClient.from("user_roles").upsert({
        user_id: newUser.user.id,
        role: u.role,
        showroom_id: u.showroom_id,
      }, { onConflict: "user_id" });

      results.push({ email: u.email, role: u.role, showroom: u.showroom_id, id: newUser.user.id });
    }

    return new Response(JSON.stringify({ success: true, deleted: deleteResults, created: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
