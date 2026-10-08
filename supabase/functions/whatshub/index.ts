import { reportDestination } from "./report-routing.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseTestTarget } from "./test-target.ts";
import { reportDefinitions, indiaDate, reportDue, weekStart, buildReport, allRows, loadReportPeople } from "./reports.ts";
import { createWhatsHubSender, parseWhatsHubSlot } from "./sender.ts";

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
      const authorized = (roles || []).find((row) => row.role === "admin") || (roles || []).find((row) => allowedRoles.has(row.role));
      if (!authorized) return json({ error: "Only TL, Manager, Admin or MD can send internal showroom messages" }, 403);
      caller = { id: user.id, role: authorized.role, showroomIds: [...new Set((roles || []).map((row) => row.showroom_id).filter(Boolean))] as string[] };
    }

    const body = await req.json();
    const action = String(body.action || "");
    const canUseShowroom = (showroomId: string) => isCron || caller?.role === "admin" || caller?.role === "md" || caller?.showroomIds.includes(showroomId);
    // Only read the sender for actual deliveries; previews/settings need no session.
    // Fail closed on configuration errors instead of silently using Number 1.
    let senderPromise: Promise<ReturnType<typeof createWhatsHubSender>> | undefined;
    const sendMessage = async (recipient: { kind: "group" | "phone"; target: string }, message: string, idempotencyKey?: string) => {
      senderPromise ??= (async () => {
        const { data, error } = await admin.rpc("get_whatshub_sender_slot");
        if (error) throw new Error("WhatsApp sending number is unavailable. Ask an admin to check WhatsHub Integration settings.");
        return createWhatsHubSender(WHATSHUB_BASE_URL, apiKey, parseWhatsHubSlot(data));
      })();
      return (await senderPromise)(recipient, message, idempotencyKey);
    };

    if (action === "send_test") {
      if (caller?.role !== "admin") return json({ error: "Only admin can send integration tests" }, 403);
      const recipient = parseTestTarget(String(body.target || ""), !!body.showroomId);
      const showroomId = body.showroomId ? String(body.showroomId) : null;
      if (showroomId) {
        const { data, error } = await admin.from("showrooms").select("id").eq("id", showroomId).single();
        if (error || !data) return json({ error: "Showroom not found" }, 400);
      }
      const message = "Art N Glass — WhatsApp integration test. If you received this message, this destination is reachable.";
      const response = await sendMessage(recipient, message);
      const result = await response.json().catch(() => null);
      const accepted = response.ok && result?.success !== false && result?.ok !== false && !result?.error;
      await admin.from("whatshub_message_logs").insert({ showroom_id: showroomId, message_type: "integration_test", message, recipient_count: 1, success_count: accepted ? 1 : 0, status: accepted ? "sent" : "failed", created_by: caller.id });
      if (!accepted) return json({ error: `WhatsHub rejected the test (HTTP ${response.status}). Check the saved API key, connected WhatsApp session and destination.` }, 400);
      return json({ accepted: true, target: recipient.target });
    }

    const sendToShowroom = async (showroomId: string, message: string, messageType: string) => {
      if (!canUseShowroom(showroomId)) throw new Error("You cannot message this showroom");
      const [showroomResult, roleRows] = await Promise.all([
        admin.from("showrooms").select("id, name, whatsapp_group_id").eq("id", showroomId).single(),
        allRows(admin.from("user_roles").select("user_id,role").eq("showroom_id", showroomId).eq("is_active", true).order("id")),
      ]);
      if (showroomResult.error) throw showroomResult.error;
      const showroom = showroomResult.data;
      if (!showroom) throw new Error("Showroom not found");
      const groupJid = String(showroom.whatsapp_group_id || "").trim();
      if (reportDestination(messageType) === "director") throw new Error("Director reports cannot be sent to a showroom");
      if (groupJid && reportDestination(messageType) === "showroom") {
        if (!groupJid.endsWith("@g.us")) throw new Error("Invalid WhatsApp Group ID. Expected a Group JID ending in @g.us");
        const response = await sendMessage({ kind: "group", target: groupJid }, message);
        const providerResult = await response.json().catch(() => null);
        const accepted = response.ok && providerResult?.success !== false && providerResult?.ok !== false && !providerResult?.error;
        await admin.from("whatshub_message_logs").insert({
          showroom_id: showroomId,
          message_type: messageType,
          message,
          recipient_count: 1,
          success_count: accepted ? 1 : 0,
          status: accepted ? "sent" : "failed",
          created_by: caller?.id || null,
        });
        if (!accepted) throw new Error(`WhatsHub group delivery failed (${response.status})`);
        return {
          showroom: showroom.name,
          recipients: 1,
          sent: 1,
          groupIdConfigured: true,
          deliveryMode: "whatsapp_group",
        };
      }

      const userIds = [...new Set((roleRows || []).filter(row => messageType !== "conveyance" || ["manager", "md", "admin"].includes(row.role)).map((row) => row.user_id))];
      const profiles = userIds.length ? await allRows(admin.from("profiles").select("user_id, full_name, phone").in("user_id", userIds).order("user_id")) : [];
      const recipients = (profiles || []).map((profile) => ({ ...profile, phone: normalizePhone(profile.phone || "") })).filter((profile) => profile.phone.length >= 11);

      const results = await Promise.all(recipients.map(async (recipient) => {
        const response = await sendMessage({ kind: "phone", target: recipient.phone }, message,
          messageType === "daily_planning" && isCron
            ? `${messageType}-${showroomId}-${recipient.user_id}-${new Date().toISOString().slice(0, 10)}`
            : undefined);
        const providerResult = await response.json().catch(() => null);
        return { userId: recipient.user_id, ok: response.ok && providerResult?.success !== false && providerResult?.ok !== false && !providerResult?.error, status: response.status };
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

    const loadReport = async (showroomId: string, key: string) => {
      if (!canUseShowroom(showroomId)) throw new Error("You cannot access this showroom");
      const definition = reportDefinitions.find(r => r.key === key);
      if (!definition) throw new Error("Unknown report");
      if (key === "conveyance" && !isCron && !["admin","md","manager"].includes(caller?.role || "")) throw new Error("Only management can access conveyance reports");
      const { data: showroom, error } = await admin.from("showrooms").select("name").eq("id", showroomId).single();
      if (error) throw error;
      const people = await loadReportPeople(admin, showroomId, key);
      const ids = people.map(person => person.user_id);
      const today = indiaDate();
      const start = definition.weekly ? weekStart(today) : today;
      let visits: any[] = [], claims: any[] = [], clients: any[] = [];
      if (ids.length) {
        if (key === "conveyance") {
          claims = await allRows(admin.from("conveyance_records").select("*").in("user_id",ids).gte("date",start).lte("date",today).order("id"));
        } else {
          let query = admin.from("visits").select("*,clients(name),partners(name)").in("created_by",ids).neq("status","cancelled").lte("visit_date",today).order("id");
          query = key === "followups" ? query.eq("status","planned") : query.gte("visit_date",start);
          visits = await allRows(query);
          if (key === "outcomes" || key === "tl_outcomes") {
            const upcoming = await allRows(admin.from("visits").select("created_by,client_id,partner_id,visit_date").in("created_by",ids).eq("status","planned").gt("visit_date",today).order("visit_date").order("id"));
            visits = visits.map(v => ({...v, next_followup: upcoming.find(n => n.created_by === v.created_by && ((v.client_id && n.client_id === v.client_id) || (v.partner_id && n.partner_id === v.partner_id)))?.visit_date}));
          }
          if (key === "weekly_summary") {
            const end = new Date(Date.parse(today+"T00:00:00+05:30")+86400000).toISOString();
            clients = await allRows(admin.from("clients").select("created_by,status").in("created_by",ids).gte("created_at",start+"T00:00:00+05:30").lt("created_at",end).order("id"));
          }
        }
      }
      return buildReport(key,showroom.name,today,people,visits,claims,clients);
    };
    const directorReport = async () => {
      if (!isCron && !["admin", "md"].includes(caller?.role || "")) throw new Error("Only Admin or Director can access the consolidated report");
      const showrooms = await allRows(admin.from("showrooms").select("id,name").order("id"));
      const assignments = await allRows(admin.from("user_roles").select("user_id,showroom_id").eq("role", "manager").eq("is_active", true).order("id"));
      const managerIds = [...new Set(assignments.map(row => row.user_id))];
      const managers = managerIds.length ? await allRows(admin.from("profiles").select("user_id,full_name").in("user_id", managerIds).order("user_id")) : [];
      const names = new Map(managers.map(person => [person.user_id, person.full_name]));
      const sections = [];
      for (const showroom of showrooms) {
        const ids = [...new Set(assignments.filter(row => row.showroom_id === showroom.id).map(row => row.user_id))];
        if (!ids.length) continue;
        sections.push('*Managers:* ' + ids.map(id => names.get(id) || 'Manager').join(', ') + '\n' + await loadReport(showroom.id, "plan_actual"));
      }
      const unassignedIds = managerIds.filter(id => !assignments.some(row => row.user_id === id && row.showroom_id));
      if (unassignedIds.length) {
        const people = managers.filter(person => unassignedIds.includes(person.user_id));
        const visits = await allRows(admin.from("visits").select("*,clients(name),partners(name)").in("created_by", unassignedIds).eq("visit_date", indiaDate()).order("id"));
        sections.push(buildReport("plan_actual", "Unassigned managers", indiaDate(), people, visits));
      }
      return '*DIRECTOR — ALL MANAGERS DAILY PLAN VS ACTUAL*\n\n' + (sections.join('\n\n────────────\n\n') || 'No active managers found.');
    };
    const sendToDirector = async (message: string) => {
      const roles = await allRows(admin.from("user_roles").select("user_id").eq("role", "md").eq("is_active", true).order("id"));
      const ids = [...new Set(roles.map(row => row.user_id))];
      if (!ids.length) throw new Error("No active Director (MD) is configured");
      const people = await allRows(admin.from("profiles").select("user_id,phone").in("user_id", ids).order("user_id"));
      const phones = [...new Set(people.map(person => normalizePhone(person.phone || "")))];
      if (people.length !== ids.length || phones.some(phone => phone.length < 11)) throw new Error("A Director's WhatsApp number is missing or invalid");
      let sent = 0;
      for (const phone of phones) {
        const response = await sendMessage({ kind: "phone", target: phone }, message, isCron ? 'director-plan-' + indiaDate() + '-' + phone : undefined);
        const result = await response.json().catch(() => null);
        if (response.ok && result?.success !== false && result?.ok !== false && !result?.error) sent++;
      }
      const { error } = await admin.from("whatshub_message_logs").insert({showroom_id: null, message_type:"plan_actual", message, recipient_count:phones.length, success_count:sent, status:sent === phones.length ? "sent" : "partial", created_by:caller?.id || null});
      if (error) throw error;
      if (sent !== phones.length) throw new Error("Director report delivery incomplete");
      return { recipients: phones.length, sent, deliveryMode: "director_personal" };
    };
    if (action === "report_settings" || action === "save_report_setting") {
      const showroomId = String(body.showroomId || "");
      if (!canUseShowroom(showroomId)) return json({error:"Forbidden"},403);
      if (action === "save_report_setting") {
        if (caller?.role !== "admin") return json({error:"Only admin can change report schedules"},403);
        if (!reportDefinitions.some(r => r.key === body.reportKey) || typeof body.enabled !== "boolean") throw new Error("Invalid report setting");
        const result = body.reportKey === "daily_planning"
          ? await admin.from("showrooms").update({whatsapp_planning_enabled:body.enabled}).eq("id",showroomId).select("id").single()
          : await admin.from("whatshub_report_settings").upsert({showroom_id:showroomId,report_key:body.reportKey,enabled:body.enabled});
        if (result.error) throw result.error;
        return json({saved:true});
      }
      const {data: showroom,error} = await admin.from("showrooms").select("whatsapp_planning_enabled").eq("id",showroomId).single();
      if (error) throw error;
      const settings = await allRows(admin.from("whatshub_report_settings").select("report_key,enabled").eq("showroom_id",showroomId).order("report_key"));
      return json({reports:reportDefinitions.map(r => ({...r,enabled:r.key === "daily_planning" ? showroom.whatsapp_planning_enabled : settings.find(s => s.report_key === r.key)?.enabled === true}))});
    }
    if (action === "preview_report" || action === "send_report") {
      const showroomId = String(body.showroomId || "");
      const key = String(body.reportKey || "");
      const consolidated = key === "plan_actual" && (action === "send_report" || ["admin", "md"].includes(caller?.role || ""));
      const message = consolidated ? await directorReport() : await loadReport(showroomId,key);
      if (action === "preview_report") return json({message});
      return json(key === "plan_actual" ? await sendToDirector(message) : await sendToShowroom(showroomId,message,key));
    }
    if (action === "run_scheduled_reports" || action === "send_planning_summaries") {
      if (action === "run_scheduled_reports" && !isCron) return json({error:"Scheduler authentication required"},403);
      if (!isCron) {
        const id = String(body.showroomId || "");
        if (!id) throw new Error("Select a showroom");
        return json({results:[await sendToShowroom(id,await loadReport(id,"daily_planning"),"daily_planning")]});
      }
      const showrooms = await allRows(admin.from("showrooms").select("id,whatsapp_planning_enabled").order("id"));
      const settings = await allRows(admin.from("whatshub_report_settings").select("*").eq("enabled",true).order("showroom_id").order("report_key"));
      const results = [];
      const now = new Date();
      if (settings.some(setting => setting.report_key === "plan_actual") && reportDue("plan_actual", now)) {
        const run = { report_key: "plan_actual", report_date: indiaDate(now) };
        const { error: claimError } = await admin.from("whatshub_director_report_runs").insert(run);
        if (claimError && claimError.code !== "23505") throw claimError;
        if (!claimError) {
          try {
            const delivery = await sendToDirector(await directorReport());
            const { error } = await admin.from("whatshub_director_report_runs").update({ status: "sent" }).match(run);
            if (error) throw error;
            results.push(delivery);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await admin.from("whatshub_director_report_runs").update({status: "failed", error: message}).match(run);
            results.push({report: "plan_actual", error: message});
          }
        }
      }
      for (const showroom of showrooms) for (const report of reportDefinitions) {
        if (report.key === "plan_actual") continue;
        const enabled = report.key === "daily_planning" ? showroom.whatsapp_planning_enabled : settings.some(s => s.showroom_id === showroom.id && s.report_key === report.key);
        if (!enabled || !reportDue(report.key,now)) continue;
        const run = {showroom_id:showroom.id, report_key:report.key, report_date:indiaDate(now)};
        const {error: claimError} = await admin.from("whatshub_report_runs").insert(run);
        if (claimError?.code === "23505") continue;
        if (claimError) throw claimError;
        try {
          const delivery = await sendToShowroom(showroom.id,await loadReport(showroom.id,report.key),report.key);
          if (!delivery.recipients || delivery.sent !== delivery.recipients) throw new Error("Incomplete delivery");
          const {error} = await admin.from("whatshub_report_runs").update({status:"sent"}).match(run);
          if (error) throw error;
          results.push(delivery);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await admin.from("whatshub_report_runs").update({status:"failed",error:message}).match(run);
          results.push({showroom:showroom.id,report:report.key,error:message});
        }
      }
      return json({results});
    }
    return json({ error: "Unsupported WhatsHub action" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "WhatsHub request failed" }, 400);
  }
});
