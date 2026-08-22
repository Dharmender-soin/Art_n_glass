import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const WHATSHUB_BASE_URL = "https://whatshub-production.up.railway.app";
const allowedRoles = new Set(["admin", "md", "manager", "tl"]);
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: runtimeRows } = await admin.rpc("get_whatshub_runtime_config");
    const runtimeConfig = runtimeRows?.[0] || {};
    const apiKey = Deno.env.get("WHATSHUB_API_KEY") || runtimeConfig.api_key;
    if (!apiKey) throw new Error("WHATSHUB_API_KEY is not configured");

    const cronSecret = Deno.env.get("WHATSHUB_CRON_SECRET") || runtimeConfig.cron_secret || "";
    const isCron = !!cronSecret && req.headers.get("X-Cron-Secret") === cronSecret;
    let caller: { id: string; role: string; showroomIds: string[] } | null = null;

    if (!isCron) {
      const authHeader = req.headers.get("Authorization") || "";
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || "", { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) return json({ error: "Unauthorized" }, 401);
      const { data: roles } = await admin.from("user_roles").select("role, showroom_id").eq("user_id", user.id).eq("is_active", true);
      const authorized = (roles || []).find((row) => allowedRoles.has(row.role));
      if (!authorized) return json({ error: "Only TL, Manager, Admin or MD can send internal showroom messages" }, 403);
      caller = { id: user.id, role: authorized.role, showroomIds: [...new Set((roles || []).map((row) => row.showroom_id).filter(Boolean))] as string[] };
    }

    const body = await req.json();
    const action = String(body.action || "");
    const canUseShowroom = (showroomId: string) => isCron || caller?.role === "admin" || caller?.role === "md" || caller?.showroomIds.includes(showroomId);

    const sendToShowroom = async (showroomId: string, message: string, messageType: string) => {
      if (!canUseShowroom(showroomId)) throw new Error("You cannot message this showroom");
      const [{ data: showroom }, { data: roleRows }] = await Promise.all([
        admin.from("showrooms").select("id, name, whatsapp_group_id").eq("id", showroomId).single(),
        admin.from("user_roles").select("user_id").eq("showroom_id", showroomId).eq("is_active", true),
      ]);
      if (!showroom) throw new Error("Showroom not found");
      const groupJid = String(showroom.whatsapp_group_id || "").trim();
      if (groupJid) {
        if (!groupJid.endsWith("@g.us")) throw new Error("Invalid WhatsApp Group ID. Expected a Group JID ending in @g.us");
        const response = await fetch(`${WHATSHUB_BASE_URL}/api/groups/${encodeURIComponent(groupJid)}/message`, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ message, slot: 1 }),
        });
        await admin.from("whatshub_message_logs").insert({
          showroom_id: showroomId,
          message_type: messageType,
          message,
          recipient_count: 1,
          success_count: response.ok ? 1 : 0,
          status: response.ok ? "sent" : "failed",
          created_by: caller?.id || null,
        });
        if (!response.ok) throw new Error(`WhatsHub group delivery failed (${response.status})`);
        return {
          showroom: showroom.name,
          recipients: 1,
          sent: 1,
          groupIdConfigured: true,
          deliveryMode: "whatsapp_group",
        };
      }

      const userIds = [...new Set((roleRows || []).map((row) => row.user_id))];
      const { data: profiles } = userIds.length ? await admin.from("profiles").select("user_id, full_name, phone").in("user_id", userIds) : { data: [] };
      const recipients = (profiles || []).map((profile) => ({ ...profile, phone: normalizePhone(profile.phone || "") })).filter((profile) => profile.phone.length >= 11);

      const results = await Promise.all(recipients.map(async (recipient) => {
        const response = await fetch(`${WHATSHUB_BASE_URL}/api/messages/send`, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            to: recipient.phone,
            message,
            type: "text",
            slot: 1,
            idempotencyKey: messageType === "daily_planning"
              ? `${messageType}-${showroomId}-${recipient.user_id}-${new Date().toISOString().slice(0, 10)}`
              : crypto.randomUUID(),
          }),
        });
        return { userId: recipient.user_id, ok: response.ok, status: response.status };
      }));
      const successCount = results.filter((result) => result.ok).length;
      await admin.from("whatshub_message_logs").insert({ showroom_id: showroomId, message_type: messageType, message, recipient_count: recipients.length, success_count: successCount, status: recipients.length > 0 && successCount === recipients.length ? "sent" : successCount > 0 ? "partial" : "failed", created_by: caller?.id || null });
      return {
        showroom: showroom.name,
        recipients: recipients.length,
        sent: successCount,
        groupIdConfigured: !!showroom.whatsapp_group_id,
        deliveryMode: "individual_staff_phones",
      };
    };

    if (action === "send_internal") {
      const showroomId = String(body.showroomId || "");
      const message = String(body.message || "").trim();
      if (!showroomId || !message) throw new Error("Showroom and message are required");
      return json(await sendToShowroom(showroomId, message, "manual_internal"));
    }

    if (action === "send_planning_summaries") {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      let showroomsQuery = admin.from("showrooms").select("id, name").eq("whatsapp_planning_enabled", true);
      if (body.showroomId) showroomsQuery = showroomsQuery.eq("id", String(body.showroomId));
      const { data: showrooms, error: showroomError } = await showroomsQuery;
      if (showroomError) throw showroomError;
      const output = [];

      for (const showroom of showrooms || []) {
        if (!canUseShowroom(showroom.id)) continue;
        const { data: roles } = await admin.from("user_roles").select("user_id").eq("showroom_id", showroom.id).eq("is_active", true);
        const userIds = [...new Set((roles || []).map((row) => row.user_id))];
        const [{ data: profiles }, { data: visits }] = await Promise.all([
          userIds.length ? admin.from("profiles").select("user_id, full_name").in("user_id", userIds) : Promise.resolve({ data: [] }),
          userIds.length ? admin.from("visits").select("created_by, status, purpose, clients(name), partners(name)").eq("visit_date", today).in("created_by", userIds).neq("status", "cancelled") : Promise.resolve({ data: [] }),
        ]);
        const visitsByPerson = new Map<string, any[]>();
        (visits || []).forEach((visit) => visitsByPerson.set(visit.created_by, [...(visitsByPerson.get(visit.created_by) || []), visit]));
        const sections = (profiles || []).map((profile, personIndex) => {
          const personVisits = visitsByPerson.get(profile.user_id) || [];
          const visitLines = personVisits.length
            ? personVisits.map((visit, visitIndex) => {
              const targetName = visit.clients?.name || visit.partners?.name || "Unlinked visit";
              return `${visitIndex + 1}) ${targetName} — ${visit.purpose || "Purpose not specified"}`;
            }).join("\n")
            : "No planned visits";
          return `*${personIndex + 1}. ${profile.full_name || "Executive"}*\n${visitLines}`;
        }).join("\n\n");
        const message = `*DAILY PLANNED VISITS REPORT*\n*Showroom:* ${showroom.name}\n*Date:* ${today}\n\n${sections || "No active team members found."}\n\n*Total planned visits: ${(visits || []).length}*\n— Art N Glass`;
        output.push(await sendToShowroom(showroom.id, message, "daily_planning"));
      }
      return json({ results: output });
    }
    return json({ error: "Unsupported WhatsHub action" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "WhatsHub request failed" }, 400);
  }
});
