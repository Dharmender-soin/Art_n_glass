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
    console.log("Create-user function invoked");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing Authorization header");
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      console.error("Missing environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY");
      return new Response(JSON.stringify({ error: "Server configuration error: Missing environment variables" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the caller is an admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: userError } = await userClient.auth.getUser();
    if (userError || !caller) {
      console.error("Error getting user:", userError);
      return new Response(JSON.stringify({ error: "Unauthorized: Unable to verify user" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Debugging: Log key length
    console.log(`Service Role Key Length: ${serviceRoleKey.length}`);

    const { data: callerRoles, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    if (roleError) {
      console.error("Error fetching caller role:", roleError);
      return new Response(JSON.stringify({
        error: "Failed to verify admin privileges",
        details: roleError
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hasAdminPrivilege = callerRoles?.some(r => r.role === "admin" || r.role === "md");

    if (!hasAdminPrivilege) {
      console.error("Caller does not have admin/md role. Roles:", callerRoles);
      return new Response(JSON.stringify({ error: "Only admins can create users" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      console.error("Error parsing JSON body:", e);
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, full_name, role, showroom_id, conveyance_type, conveyance_rate } = body;

    if (!email || !password || !full_name || !role) {
      console.error("Missing required fields:", { email, hasPassword: !!password, full_name, role });
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create user with admin API
    console.log("Creating user:", email);
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: { full_name },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Assign role
    console.log("Assigning role:", role, "to user:", newUser.user.id);
    const { error: roleInsertError } = await adminClient.from("user_roles").insert({
      user_id: newUser.user.id,
      role,
      showroom_id: showroom_id || null,
    });

    if (roleInsertError) {
      console.error("Error assigning role:", roleInsertError);
      // Try to clean up user if role assignment fails? Or just report error?
      // Returning error but user created is tricky.
      return new Response(JSON.stringify({ error: "User created but failed to assign role: " + roleInsertError.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Profile is created by trigger, but update full_name just in case
    console.log("Updating profile for:", newUser.user.id);
    const { error: profileError } = await adminClient.from("profiles").upsert({
      user_id: newUser.user.id,
      full_name,
      conveyance_type: conveyance_type || 'bike',
      conveyance_rate: conveyance_rate || 4
    }, { onConflict: "user_id" });

    if (profileError) {
      console.error("Error updating profile:", profileError);
      // Non-fatal, return success but warn log
    }

    console.log("User created successfully");
    return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Unhandled error in create-user:", err);
    return new Response(JSON.stringify({ error: message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
