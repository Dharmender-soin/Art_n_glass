import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader)
      return new Response(JSON.stringify({ error: "Unauthorized: Missing Authorization header" }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user)
      return new Response(JSON.stringify({ error: `Unauthorized: ${authError?.message || 'Invalid user session'}` }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Request body ──────────────────────────────────────────────────────────
    const { question, history = [] } = await req.json();
    if (!question?.trim())
      return new Response(JSON.stringify({ error: "No question" }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });

    // ── Get user profile (full_name) and role from user_roles ─────────────────
    // NOTE: roles are stored in user_roles table, NOT in profiles table
    const [profileRes, roleRes] = await Promise.all([
      admin.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
      admin.from("user_roles").select("role, showroom_id").eq("user_id", user.id).maybeSingle(),
    ]);

    const userName = profileRes.data?.full_name ?? "User";
    const role = roleRes.data?.role ?? "executive";
    const showroomId = roleRes.data?.showroom_id ?? null;

    // ── Fetch role-scoped data ────────────────────────────────────────────────
    let contextData: Record<string, unknown> = {};
    const now = new Date();

    if (role === "executive") {
      const [visitsRes, wosRes] = await Promise.all([
        admin.from("visits")
          .select("id, visit_date, purpose, clients(name, city)")
          .eq("created_by", user.id)
          .order("visit_date", { ascending: false })
          .limit(60),
        admin.from("work_scope_items")
          .select("id, work_status, created_at, submitted_at, verified_at, clients(name, city), master_work_types(type_of_work, sub_work)")
          .eq("created_by", user.id)
          .order("created_at", { ascending: false }),
      ]);

      const wos = (wosRes.data ?? []) as any[];
      const visits = (visitsRes.data ?? []) as any[];

      contextData = {
        role: "Executive",
        name: userName,
        visitsSummary: {
          total: visits.length,
          thisWeek: visits.filter((v: any) => {
            const d = new Date(v.visit_date);
            const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
            return d >= weekAgo;
          }).length,
          thisMonth: visits.filter((v: any) => {
            const d = new Date(v.visit_date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).length,
        },
        recentVisits: visits.slice(0, 15).map((v: any) => ({
          date: v.visit_date,
          client: (v.clients as any)?.name,
          city: (v.clients as any)?.city,
          purpose: v.purpose,
        })),
        wosPipeline: {
          total: wos.length,
          wos: wos.filter((w: any) => w.work_status === "pending" || w.work_status === "draft").length,
          quotation: wos.filter((w: any) => w.work_status === "submitted").length,
          won: wos.filter((w: any) => w.work_status === "won").length,
          lost: wos.filter((w: any) => w.work_status === "lost").length,
        },
        wosItems: wos.slice(0, 25).map((w: any) => ({
          client: (w.clients as any)?.name,
          city: (w.clients as any)?.city,
          type: `${(w.master_work_types as any)?.type_of_work} — ${(w.master_work_types as any)?.sub_work}`,
          status: w.work_status === "pending" ? "WOS" : w.work_status === "submitted" ? "Quotation" : w.work_status,
          addedOn: w.created_at?.split("T")[0],
          quotationOn: w.submitted_at?.split("T")[0] ?? null,
          closedOn: w.verified_at?.split("T")[0] ?? null,
        })),
      };

    } else if (role === "manager") {
      // user_roles has executive list for this showroom
      const { data: execRoles } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("showroom_id", showroomId)
        .eq("role", "executive");

      const execIds = (execRoles ?? []).map((r: any) => r.user_id);

      const [profilesRes, visitsRes, wosRes] = await Promise.all([
        execIds.length > 0
          ? admin.from("profiles").select("user_id, full_name").in("user_id", execIds)
          : Promise.resolve({ data: [] }),
        execIds.length > 0
          ? admin.from("visits").select("id, visit_date, created_by").in("created_by", execIds).order("visit_date", { ascending: false }).limit(200)
          : Promise.resolve({ data: [] }),
        execIds.length > 0
          ? admin.from("work_scope_items").select("id, work_status, created_at, created_by, clients(name, city), master_work_types(type_of_work, sub_work)").in("created_by", execIds).order("created_at", { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);

      const execProfiles = (profilesRes.data ?? []) as any[];
      const wos = (wosRes.data ?? []) as any[];
      const visits = (visitsRes.data ?? []) as any[];

      contextData = {
        role: "Manager",
        name: userName,
        executivePerformance: execProfiles.map((ep: any) => ({
          name: ep.full_name,
          totalVisits: visits.filter((v: any) => v.created_by === ep.user_id).length,
          totalWOS: wos.filter((w: any) => w.created_by === ep.user_id).length,
          won: wos.filter((w: any) => w.created_by === ep.user_id && w.work_status === "won").length,
          lost: wos.filter((w: any) => w.created_by === ep.user_id && w.work_status === "lost").length,
          openWOS: wos.filter((w: any) => w.created_by === ep.user_id && w.work_status === "pending").length,
          pendingQuotations: wos.filter((w: any) => w.created_by === ep.user_id && w.work_status === "submitted").length,
        })),
        showroomPipeline: {
          total: wos.length,
          wosStage: wos.filter((w: any) => w.work_status === "pending").length,
          quotationStage: wos.filter((w: any) => w.work_status === "submitted").length,
          won: wos.filter((w: any) => w.work_status === "won").length,
          lost: wos.filter((w: any) => w.work_status === "lost").length,
        },
        visitsThisMonth: visits.filter((v: any) => {
          const d = new Date(v.visit_date);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).length,
      };

    } else {
      // MD / Admin — company-wide view
      // Get all user_roles to build showroom and executive mappings
      const [showroomsRes, allRolesRes, wosRes, visitsRes] = await Promise.all([
        admin.from("showrooms").select("id, name"),
        admin.from("user_roles").select("user_id, role, showroom_id"),
        admin.from("work_scope_items").select("id, work_status, created_at, created_by").order("created_at", { ascending: false }),
        admin.from("visits").select("id, visit_date, created_by").order("visit_date", { ascending: false }).limit(500),
      ]);

      const showrooms = (showroomsRes.data ?? []) as any[];
      const allRoles = (allRolesRes.data ?? []) as any[];
      const wos = (wosRes.data ?? []) as any[];
      const visits = (visitsRes.data ?? []) as any[];

      const execRoles = allRoles.filter((r: any) => r.role === "executive");
      const managerRoles = allRoles.filter((r: any) => r.role === "manager");

      contextData = {
        role: "MD/Admin",
        name: userName,
        companyOverview: {
          totalShowrooms: showrooms.length,
          totalExecutives: execRoles.length,
          totalManagers: managerRoles.length,
          visitsThisMonth: visits.filter((v: any) => {
            const d = new Date(v.visit_date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).length,
          totalVisits: visits.length,
        },
        pipelineOverview: {
          total: wos.length,
          wosStage: wos.filter((w: any) => w.work_status === "pending").length,
          quotationStage: wos.filter((w: any) => w.work_status === "submitted").length,
          won: wos.filter((w: any) => w.work_status === "won").length,
          lost: wos.filter((w: any) => w.work_status === "lost").length,
          conversionRate: wos.filter((w: any) => w.work_status === "won" || w.work_status === "lost").length > 0
            ? ((wos.filter((w: any) => w.work_status === "won").length /
                wos.filter((w: any) => w.work_status === "won" || w.work_status === "lost").length) * 100).toFixed(1) + "%"
            : "N/A",
        },
        showroomPerformance: showrooms.map((sr: any) => {
          const srExecIds = execRoles
            .filter((r: any) => r.showroom_id === sr.id)
            .map((r: any) => r.user_id);
          const srWos = wos.filter((w: any) => srExecIds.includes(w.created_by));
          const srVisits = visits.filter((v: any) => srExecIds.includes(v.created_by));
          return {
            showroom: sr.name,
            executives: srExecIds.length,
            visits: srVisits.length,
            totalWOS: srWos.length,
            won: srWos.filter((w: any) => w.work_status === "won").length,
            lost: srWos.filter((w: any) => w.work_status === "lost").length,
            openPipeline: srWos.filter((w: any) => w.work_status === "pending" || w.work_status === "submitted").length,
          };
        }),
      };
    }

    // ── System prompt ─────────────────────────────────────────────────────────
    const systemPrompt = `You are an intelligent AI sales assistant for VisitWiz Pro — a field sales management platform for a glass, aluminum, and construction materials company.

You are speaking with ${userName} (${role.toUpperCase()}).
Current date: ${new Date().toISOString().split("T")[0]}

PIPELINE STAGES:
- WOS = new lead scope identified during site visit (pending)
- Quotation = executive has sent a quotation (submitted)
- Won = order confirmed
- Lost = deal not received

RULES:
- Answer ONLY based on the data context below
- Be concise and professional (max 200 words unless detailed analysis requested)
- Use bullet points and numbers for list data
- Never fabricate or guess statistics — if data is insufficient, say so
- English only

USER DATA CONTEXT:
${JSON.stringify(contextData, null, 2)}`;

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ answer: "AI Assistant is not configured. Please set the GEMINI_API_KEY secret." }),
        { headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const contents = [
      ...history.slice(-6).map((m: any) => ({ role: m.role, parts: [{ text: m.text }] })),
      { role: "user", parts: [{ text: question }] },
    ];

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    
    if (geminiData.error) {
      console.error("Gemini API Error: ", geminiData.error);
      return new Response(
        JSON.stringify({ error: `Gemini API Error: ${geminiData.error.message || JSON.stringify(geminiData.error)}` }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const answer =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text ??
      "I couldn't generate a response. Please try again.";

    return new Response(JSON.stringify({ answer }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("AI Assistant Error:", error);
    return new Response(
      JSON.stringify({ error: error.stack || error.message || "Internal server error" }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } } // HTTP 200 to bypass generic client errors
    );
  }
});
