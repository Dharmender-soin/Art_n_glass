import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-export-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Simple secret key auth for Google Apps Script
  const exportKey = req.headers.get("x-export-key");
  const expectedKey = Deno.env.get("EXPORT_SECRET_KEY");

  if (!expectedKey || exportKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const url = new URL(req.url);
  const table = url.searchParams.get("table");

  const tables = ["clients", "partners", "visits", "work_scope_items", "profiles", "user_roles", "showrooms", "master_work_types"];

  if (table && tables.includes(table)) {
    const { data, error } = await supabase.from(table).select("*").limit(5000);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ [table]: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Return all tables
  const result: Record<string, unknown[]> = {};
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select("*").limit(5000);
    if (error) {
      result[t] = [{ error: error.message }];
    } else {
      result[t] = data || [];
    }
  }

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
