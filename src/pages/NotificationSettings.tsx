import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Sliders, Save, BellRing, Settings, Loader2, Clock, Smartphone, Image as ImageIcon, BarChart3, Zap, MessageCircle, ShieldCheck, Plug, KeyRound, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

import { Navigate } from "react-router-dom";
import {
  triggerMorningSalesPlanReport,
  triggerDailyBusinessSummaryReport,
  triggerEODDSRReport,
  triggerInactivityEscalationReport,
  triggerPartnerOverdueReport,
  triggerGPSMisalignmentReport,
  triggerStartDayReminder,
  triggerEndDayReminder,
} from "@/lib/scheduledReportGenerator";
import { sendInternalShowroomMessage, sendShowroomPlanningNow } from "@/lib/whatshub";

export default function NotificationSettings() {
  const { user, role, loading, showroomId, showroomIds } = useAuth();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<"schedule" | "rules" | "modules" | "whatshub" | "integrations" | "preview">("schedule");
  const [whatsHubShowroom, setWhatsHubShowroom] = useState("");
  const [internalMessage, setInternalMessage] = useState("");
  const [planningPreview, setPlanningPreview] = useState("");
  const [integrationForm, setIntegrationForm] = useState({
    apiKey: "",
    cronSecret: "",
    projectUrl: import.meta.env.VITE_SUPABASE_URL || "",
    anonKey: "",
  });
  const [showroomGroups, setShowroomGroups] = useState<Record<string, { groupId: string; planningEnabled: boolean }>>({});

  const { data: whatsHubShowrooms = [] } = useQuery({
    queryKey: ["whatshub-showrooms", role, showroomIds],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase.from("showrooms").select("id, name").order("name");
      if (role !== "admin" && role !== "md") {
        const allowed = [...new Set([...showroomIds, ...(showroomId ? [showroomId] : [])])];
        if (!allowed.length) return [];
        query = query.in("id", allowed);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (!whatsHubShowroom && whatsHubShowrooms[0]?.id) setWhatsHubShowroom(whatsHubShowrooms[0].id);
  }, [whatsHubShowroom, whatsHubShowrooms]);

  const { data: integrationStatus = { api_key_configured: false, cron_secret_configured: false, project_url_configured: false, anon_key_configured: false, setup_ready: false } } = useQuery({
    queryKey: ["whatshub-integration-status"],
    enabled: role === "admin",
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_whatshub_integration_status");
      if (error) return { api_key_configured: false, cron_secret_configured: false, project_url_configured: false, anon_key_configured: false, setup_ready: false };
      return { ...(data || {}), setup_ready: true };
    },
  });

type IntegrationShowroom = {
  id: string;
  name: string;
  whatsapp_group_id?: string | null;
  whatsapp_planning_enabled?: boolean | null;
};

  const { data: rawIntegrationShowrooms } = useQuery<IntegrationShowroom[]>({
    queryKey: ["whatshub-integration-showrooms", whatsHubShowrooms.map((showroom) => showroom.id).join(",")],
    enabled: role === "admin" && whatsHubShowrooms.length > 0,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("showrooms").select("id, name, whatsapp_group_id, whatsapp_planning_enabled").order("name");
      if (error) return whatsHubShowrooms.map((showroom) => ({ ...showroom, whatsapp_group_id: null, whatsapp_planning_enabled: true }));
      return (data as IntegrationShowroom[]) || [];
    },
  });

  const integrationShowrooms: IntegrationShowroom[] = rawIntegrationShowrooms || whatsHubShowrooms;

  useEffect(() => {
    if (!integrationShowrooms.length) return;
    setShowroomGroups((current) => {
      const next = { ...current };
      integrationShowrooms.forEach((showroom) => {
        if (!next[showroom.id]) next[showroom.id] = { groupId: showroom.whatsapp_group_id || "", planningEnabled: showroom.whatsapp_planning_enabled ?? true };
      });
      return next;
    });
  }, [integrationShowrooms]);

  const saveIntegrationMutation = useMutation({
    mutationFn: async () => {
      const groups = integrationShowrooms.map((showroom) => ({
        showroom_id: showroom.id,
        group_id: showroomGroups[showroom.id]?.groupId || "",
        planning_enabled: showroomGroups[showroom.id]?.planningEnabled ?? true,
      }));
      const { error } = await (supabase.rpc as any)("configure_whatshub_integration", {
        p_api_key: integrationForm.apiKey.trim() || null,
        p_cron_secret: integrationForm.cronSecret.trim() || null,
        p_project_url: integrationForm.projectUrl.trim() || null,
        p_anon_key: integrationForm.anonKey.trim() || null,
        p_showroom_groups: groups,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setIntegrationForm((current) => ({ ...current, apiKey: "", cronSecret: "", anonKey: "" }));
      queryClient.invalidateQueries({ queryKey: ["whatshub-integration-status"] });
      queryClient.invalidateQueries({ queryKey: ["whatshub-integration-showrooms"] });
      toast.success("WhatsHub integration saved securely in Supabase Vault");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendInternalMutation = useMutation({
    mutationFn: () => sendInternalShowroomMessage(whatsHubShowroom, internalMessage.trim()),
    onSuccess: (result) => { toast.success(result.deliveryMode === "whatsapp_group" ? "Message sent to the showroom WhatsApp group" : `Sent to ${result.sent}/${result.recipients} staff phones`); setInternalMessage(""); },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendPlanningMutation = useMutation({
    mutationFn: () => sendShowroomPlanningNow(whatsHubShowroom),
    onSuccess: () => toast.success("10:30 planning summary sent"),
    onError: (error: Error) => toast.error(error.message),
  });

  const previewPlanningMutation = useMutation({
    mutationFn: async () => {
      const showroom = whatsHubShowrooms.find((item) => item.id === whatsHubShowroom);
      if (!showroom) throw new Error("Select a showroom first");
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const { data: roles, error: rolesError } = await supabase.from("user_roles").select("user_id").eq("showroom_id", showroom.id).eq("is_active", true);
      if (rolesError) throw rolesError;
      const userIds = [...new Set((roles || []).map((item) => item.user_id))];
      const [{ data: profiles, error: profilesError }, { data: visits, error: visitsError }] = await Promise.all([
        userIds.length ? supabase.from("profiles").select("user_id, full_name").in("user_id", userIds) : Promise.resolve({ data: [], error: null }),
        userIds.length ? supabase.from("visits").select("created_by, status, purpose, clients(name), partners(name)").eq("visit_date", today).in("created_by", userIds).neq("status", "cancelled") : Promise.resolve({ data: [], error: null }),
      ]);
      if (profilesError) throw profilesError;
      if (visitsError) throw visitsError;
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
      return `*DAILY PLANNED VISITS REPORT*\n*Showroom:* ${showroom.name}\n*Date:* ${today}\n\n${sections || "No active team members found."}\n\n*Total planned visits: ${(visits || []).length}*\n— Art N Glass`;
    },
    onSuccess: (message) => setPlanningPreview(message),
    onError: (error: Error) => toast.error(error.message),
  });
  const [whatsHub, setWhatsHub] = useState({
    enabled: false,
    staff_enabled: true,
    client_enabled: false,
    client_opt_in_required: true,
    md_morning_brief: true,
    md_evening_summary: true,
    critical_alerts: true,
    start_end_day: false,
    weekly_consolidated: true,
    default_channel: "push",
    quiet_start: "21:30",
    quiet_end: "08:30",
    daily_limit: 4,
    duplicate_window_minutes: 60,
  });

  const [toggles, setToggles] = useState<Record<string, boolean>>({
    daily_summary: true,
    morning_plan: true,
    dsr_report: true,
    missed_visit: true,
    overdue_followup: true,
    exec_performance: true,
    low_performance: true,
    target_update: true,
    pipeline_report: true,
    deal_won: true,
    deal_lost: true,
    high_value_opportunity: true,
    pending_quotation: true,
    client_activity: true,
    no_visit_client: true,
    team_activity: true,
    partner_report: true,
    exception_report: true,
    weekly_report: true,
    monthly_report: true,
  });

  const [thresholds, setThresholds] = useState<Record<string, number>>({
    low_performance_pct_max: 50,
    executive_inactivity_days: 5,
    partner_overdue_days: 15,
    no_client_visit_days: 30,
    quotation_pending_days: 7,
    followup_overdue_days: 3,
  });

  const [timings, setTimings] = useState<Record<string, string>>({
    morning_plan_time: "08:30",
    daily_summary_time: "19:00",
    dsr_report_time: "20:00",
    weekly_report_day: "Saturday",
    weekly_report_time: "20:00",
  });

  // Fetch preferences from local storage or DB
  const { data: prefs } = useQuery({
    queryKey: ["notification-preferences", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      try {
        const local = localStorage.getItem("admin_notification_settings");
        if (local) return JSON.parse(local);

        const { data } = await supabase
          .from("notification_settings" as any)
          .select("*")
          .eq("user_id", user?.id)
          .maybeSingle();

        return data || null;
      } catch {
        return null;
      }
    },
  });

  useEffect(() => {
    const local = localStorage.getItem("admin_notification_settings");
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (parsed.toggles) setToggles((prev) => ({ ...prev, ...parsed.toggles }));
        if (parsed.thresholds) setThresholds((prev) => ({ ...prev, ...parsed.thresholds }));
        if (parsed.timings) setTimings((prev) => ({ ...prev, ...parsed.timings }));
        if (parsed.whatsHub) setWhatsHub((prev) => ({ ...prev, ...parsed.whatsHub }));
      } catch (e) {
        console.warn("Error parsing local notification settings:", e);
      }
    } else if (prefs) {
      if (prefs.enabled_notifications) setToggles((prev) => ({ ...prev, ...(prefs.enabled_notifications as any) }));
      if (prefs.thresholds) setThresholds((prev) => ({ ...prev, ...(prefs.thresholds as any) }));
      if ((prefs as any).timings) setTimings((prev) => ({ ...prev, ...((prefs as any).timings as any) }));
      if ((prefs as any).whatsHub) setWhatsHub((prev) => ({ ...prev, ...((prefs as any).whatsHub as any) }));
    }
  }, [prefs]);

  // Save Preferences Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const payload = { toggles, thresholds, timings, whatsHub, updated_at: new Date().toISOString() };
      localStorage.setItem("admin_notification_settings", JSON.stringify(payload));

      // Try persisting to DB
      try {
        await supabase.from("notification_settings" as any).upsert(
          {
            user_id: user.id,
            key: "admin_settings",
            value: JSON.stringify(payload),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      } catch (e) {
        console.warn("DB persist silent fallback:", e);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      toast.success("Notification settings saved successfully!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save preferences");
    },
  });

  useEffect(() => {
    if (!loading && role && role !== "admin") {
      toast.error("Only System Admin can access notification settings.");
    }
  }, [loading, role]);

  if (loading || !role) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== "admin") {
    return <Navigate to="/" replace />;
  }

  const notificationTypes = [
    { key: "daily_summary", label: "Daily Summary Report", category: "Report" },
    { key: "morning_plan", label: "Morning Sales Plan", category: "Report" },
    { key: "dsr_report", label: "End-of-Day DSR Report", category: "Report" },
    { key: "missed_visit", label: "Missed Visit Alerts", category: "Reminder" },
    { key: "overdue_followup", label: "Overdue Follow-up Alerts", category: "Reminder" },
    { key: "exec_performance", label: "Executive Performance Reports", category: "Report" },
    { key: "low_performance", label: "Low Performance Alerts (< 50%)", category: "Critical" },
    { key: "target_update", label: "Target Achievement Updates", category: "Important" },
    { key: "pipeline_report", label: "Sales & WOS Pipeline Reports", category: "Report" },
    { key: "deal_won", label: "Won Deal Notifications", category: "Important" },
    { key: "deal_lost", label: "Lost Deal Alerts", category: "Critical" },
    { key: "high_value_opportunity", label: "High-Value Opportunity Alerts", category: "Important" },
    { key: "pending_quotation", label: "Pending Quotations Report", category: "Reminder" },
    { key: "client_activity", label: "Client Activity Updates", category: "Informational" },
    { key: "no_visit_client", label: "No-Visit Client Alerts", category: "Reminder" },
    { key: "team_activity", label: "Team Attendance Updates", category: "Informational" },
    { key: "partner_report", label: "Partner & Architect Updates", category: "Informational" },
    { key: "exception_report", label: "Management Exception Alerts", category: "Critical" },
    { key: "weekly_report", label: "Weekly Management Report", category: "Report" },
    { key: "monthly_report", label: "Monthly Management Report", category: "Report" },
  ];

  const enabledCount = notificationTypes.filter((item) => toggles[item.key] ?? true).length;
  const sections = [
    { id: "schedule" as const, label: "Schedule", icon: Clock },
    { id: "rules" as const, label: "Alert Rules", icon: Sliders },
    { id: "modules" as const, label: "20 Modules", icon: BellRing },
    { id: "whatshub" as const, label: "Delivery", icon: MessageCircle },
    { id: "integrations" as const, label: "Integrations", icon: Plug },
    { id: "preview" as const, label: "Preview", icon: Smartphone },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-br from-[#b31324] to-[#8f0f1e] text-white p-5 sm:p-6 rounded-2xl border border-red-950/20 shadow-lg shadow-red-950/10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white/15 text-white border border-white/15">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Notification Settings & Thresholds</h1>
              <p className="text-xs text-white/70 mt-1">
              Control automated reports, escalation rules and mobile delivery from one place.
            </p>
          </div>
        </div>

        <Button
          variant="default"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="gap-2 font-bold shadow-md shrink-0 bg-white text-red-700 hover:bg-red-50"
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Settings
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Modules enabled", value: `${enabledCount}/20`, detail: "Automated alert types", icon: BellRing, color: "text-red-600 bg-red-50 dark:bg-red-950/30" },
          { label: "Report categories", value: "5", detail: "Critical to informational", icon: BarChart3, color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30" },
          { label: "Next morning report", value: timings.morning_plan_time || "08:30", detail: "Morning sales plan", icon: Clock, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" },
          { label: "Mobile delivery", value: "FCM", detail: "Bell + Android push", icon: Smartphone, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" },
        ].map(({ label, value, detail, icon: Icon, color }) => (
          <Card key={label} className="border-border/70 shadow-sm">
            <CardContent className="p-4 flex items-start gap-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}><Icon className="h-5 w-5" /></div>
              <div className="min-w-0"><p className="text-xl font-black leading-none">{value}</p><p className="text-xs font-bold mt-1.5">{label}</p><p className="text-[10px] text-muted-foreground truncate">{detail}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md py-2 -mx-1 px-1">
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-sm lg:grid-cols-6">
          {sections.map(({ id, label, icon: Icon }) => (
            <Button key={id} type="button" variant="ghost" onClick={() => setActiveSection(id)} className={`h-11 rounded-xl gap-1.5 px-2 text-[11px] sm:text-xs ${activeSection === id ? "bg-red-600 text-white hover:bg-red-700 hover:text-white shadow-sm" : "text-muted-foreground"}`}>
              <Icon className="h-4 w-4" /><span className="hidden min-[360px]:inline">{label}</span>
            </Button>
          ))}
        </div>
      </div>

      {activeSection === "integrations" && role === "admin" && (
        <div className="space-y-5">
          <Card className="border-indigo-200 shadow-sm dark:border-indigo-900/60">
            <CardHeader className="bg-gradient-to-r from-indigo-50 to-background dark:from-indigo-950/30">
              <CardTitle className="flex items-center gap-2"><Plug className="h-5 w-5 text-indigo-600" /> WhatsHub Integration</CardTitle>
              <CardDescription>Admin-only secure configuration. Secret values are sent directly to Supabase Vault, are never saved in localStorage, and are never shown again.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 p-5">
              {!integrationStatus.setup_ready && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  Deploy the admin integration migration first. Until then this form cannot save credentials.
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { key: "apiKey" as const, label: "WhatsHub API Key", placeholder: "Enter a new API key", configured: integrationStatus.api_key_configured },
                  { key: "cronSecret" as const, label: "Scheduler Secret", placeholder: "Enter or rotate cron secret", configured: integrationStatus.cron_secret_configured },
                  { key: "projectUrl" as const, label: "Supabase Project URL", placeholder: "https://project.supabase.co", configured: integrationStatus.project_url_configured },
                  { key: "anonKey" as const, label: "Supabase Anon Key", placeholder: "Enter anon key", configured: integrationStatus.anon_key_configured },
                ].map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label>{field.label}</Label>
                      {field.configured && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Configured</span>}
                    </div>
                    <Input
                      type={field.key === "projectUrl" ? "url" : "password"}
                      autoComplete="new-password"
                      value={integrationForm[field.key]}
                      onChange={(event) => setIntegrationForm((current) => ({ ...current, [field.key]: event.target.value }))}
                      placeholder={field.placeholder}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-5 w-5 text-emerald-600" /> Showroom WhatsApp Groups</CardTitle>
              <CardDescription>Store a separate Group JID for every showroom and control its daily 10:30 report.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {integrationShowrooms.map((showroom) => {
                const group = showroomGroups[showroom.id] || { groupId: "", planningEnabled: true };
                return (
                  <div key={showroom.id} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[180px_1fr_auto] sm:items-center">
                    <p className="text-sm font-bold">{showroom.name}</p>
                    <Input value={group.groupId} onChange={(event) => setShowroomGroups((current) => ({ ...current, [showroom.id]: { ...group, groupId: event.target.value } }))} placeholder="WhatsApp Group JID (12345@g.us)" />
                    <div className="flex items-center gap-2"><Label className="text-xs">10:30 report</Label><Switch checked={group.planningEnabled} onCheckedChange={(checked) => setShowroomGroups((current) => ({ ...current, [showroom.id]: { ...group, planningEnabled: checked } }))} /></div>
                  </div>
                );
              })}
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                A configured Group JID receives the message through WhatsHub's group endpoint. If a showroom has no Group JID, delivery safely falls back to its active staff phone numbers.
              </div>
              <Button type="button" onClick={() => saveIntegrationMutation.mutate()} disabled={saveIntegrationMutation.isPending || !integrationStatus.setup_ready} className="gap-2">
                {saveIntegrationMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Save Integration Securely
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {activeSection === "whatshub" && (
        <div className="space-y-5">
          <Card className="overflow-hidden border-emerald-200 shadow-sm dark:border-emerald-900/60">
            <CardHeader className="bg-gradient-to-r from-emerald-50 to-background dark:from-emerald-950/30">
              <CardTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-emerald-600" /> Notification Delivery Automation</CardTitle>
              <CardDescription>Configure recipients, frequency, and automation policies for in-app and Android push notifications. External channels remain optional integrations.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 p-5 sm:grid-cols-2">
              {[
                { key: "enabled", label: "Enable notification automations", help: "Master switch for scheduled summaries and rule-based alerts." },
                { key: "staff_enabled", label: "Internal staff messages", help: "Operational alerts for MDs, Managers, Team Leaders, and Executives." },
                { key: "client_enabled", label: "Client-facing notifications", help: "Disabled by default. Enable only for client portal or app users." },
                { key: "client_opt_in_required", label: "Client consent mandatory", help: "Do not generate client-facing notifications without consent." },
              ].map((item) => (
                <div key={item.key} className="flex items-start justify-between gap-4 rounded-2xl border p-4">
                  <div><p className="text-sm font-bold">{item.label}</p><p className="mt-1 text-xs text-muted-foreground">{item.help}</p></div>
                  <Switch checked={Boolean(whatsHub[item.key as keyof typeof whatsHub])} onCheckedChange={(checked) => setWhatsHub((current) => ({ ...current, [item.key]: checked }))} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-emerald-200 shadow-sm dark:border-emerald-900/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-5 w-5 text-emerald-600" /> Showroom Internal WhatsApp</CardTitle>
              <CardDescription>Send one operational message to the selected showroom group. If no Group JID is configured, active staff phones are used as fallback. Client and Partner numbers are never used.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
                <div className="space-y-1.5">
                  <Label>Showroom</Label>
                  <select value={whatsHubShowroom} onChange={(event) => setWhatsHubShowroom(event.target.value)} className="h-10 w-full rounded-xl border bg-background px-3 text-sm">
                    {whatsHubShowrooms.map((showroom) => <option key={showroom.id} value={showroom.id}>{showroom.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Internal message</Label>
                  <Textarea value={internalMessage} onChange={(event) => setInternalMessage(event.target.value)} placeholder="Example: Team meeting at 4:00 PM. Please update all visit remarks before joining." className="min-h-20" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => sendInternalMutation.mutate()} disabled={!whatsHubShowroom || !internalMessage.trim() || sendInternalMutation.isPending} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                  {sendInternalMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} Send Internal Message
                </Button>
                <Button type="button" variant="outline" onClick={() => sendPlanningMutation.mutate()} disabled={!whatsHubShowroom || sendPlanningMutation.isPending} className="gap-2">
                  {sendPlanningMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />} Send Planning Now
                </Button>
                <Button type="button" variant="secondary" onClick={() => previewPlanningMutation.mutate()} disabled={!whatsHubShowroom || previewPlanningMutation.isPending} className="gap-2">
                  {previewPlanningMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />} Preview 10:30 Summary
                </Button>
              </div>
              {planningPreview && <pre className="whitespace-pre-wrap rounded-xl border bg-slate-950 p-4 text-xs leading-5 text-slate-100">{planningPreview}</pre>}
              <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                Automatic planning runs daily at 10:30 AM IST. A configured Group JID receives one group message; otherwise the same summary is delivered individually to showroom staff and logged centrally.
              </p>
              <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                Admin can securely configure credentials and each showroom's Group ID from the <strong>Integrations</strong> tab.
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Internal automation rules</CardTitle><CardDescription>Useful, consolidated in-app and phone notifications.</CardDescription></CardHeader><CardContent className="space-y-3">
              {[
                { key: "md_morning_brief", label: "MD morning brief" },
                { key: "md_evening_summary", label: "MD evening summary" },
                { key: "critical_alerts", label: "Critical exceptions" },
                { key: "start_end_day", label: "Start/End Day reminders" },
                { key: "weekly_consolidated", label: "One consolidated weekly report" },
              ].map((item) => <div key={item.key} className="flex items-center justify-between rounded-xl border px-3 py-3"><Label className="text-xs font-semibold">{item.label}</Label><Switch checked={Boolean(whatsHub[item.key as keyof typeof whatsHub])} onCheckedChange={(checked) => setWhatsHub((current) => ({ ...current, [item.key]: checked }))} /></div>)}
            </CardContent></Card>

            <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Safety & frequency</CardTitle><CardDescription>Control spam, duplicates, and delivery outside business hours.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label>Default delivery</Label><select value={whatsHub.default_channel} onChange={(event) => setWhatsHub((current) => ({ ...current, default_channel: event.target.value }))} className="h-10 w-full rounded-xl border bg-background px-3 text-sm"><option value="push">Android Push + Bell</option><option value="whatshub">Bell only</option><option value="both">Critical: Push + Bell</option></select></div>
              <div className="space-y-1.5"><Label>Quiet hours start</Label><Input type="time" value={whatsHub.quiet_start} onChange={(event) => setWhatsHub((current) => ({ ...current, quiet_start: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Quiet hours end</Label><Input type="time" value={whatsHub.quiet_end} onChange={(event) => setWhatsHub((current) => ({ ...current, quiet_end: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Daily limit / person</Label><Input type="number" min={1} max={20} value={whatsHub.daily_limit} onChange={(event) => setWhatsHub((current) => ({ ...current, daily_limit: Number(event.target.value) || 1 }))} /></div>
              <div className="space-y-1.5"><Label>Duplicate block (minutes)</Label><Input type="number" min={5} value={whatsHub.duplicate_window_minutes} onChange={(event) => setWhatsHub((current) => ({ ...current, duplicate_window_minutes: Number(event.target.value) || 5 }))} /></div>
            </CardContent></Card>
          </div>

          <div className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Core notification policy</p><p className="mt-1 text-xs">Every generated alert remains available in notification history. Android push is used for actionable alerts; external products such as WhatsHub can be connected later as optional channel adapters.</p></div></div>
        </div>
      )}

      {activeSection === "preview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card className="border-red-200 dark:border-red-900/50 overflow-hidden shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-red-600" /> Android Notification Preview</CardTitle><CardDescription>Current reliable push format on employee and MD phones.</CardDescription></CardHeader>
            <CardContent>
              <div className="mx-auto max-w-sm rounded-[2rem] bg-slate-950 p-3 shadow-xl">
                <div className="rounded-2xl bg-white p-4 text-slate-900">
                  <div className="flex gap-3"><div className="h-9 w-9 rounded-xl bg-red-600 text-white flex items-center justify-center"><BellRing className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><p className="text-xs font-bold">Art N Glass</p><span className="text-[9px] text-slate-400">now</span></div><p className="text-sm font-black mt-1">Daily Business Summary</p><p className="text-xs text-slate-600 mt-1 leading-relaxed">18/24 visits completed · 6 WOS submitted · 2 deals won. Tap to open the report.</p></div></div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border shadow-sm">
            <CardHeader><CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5 text-indigo-600" /> Rich Notification Options</CardTitle><CardDescription>Design options that can make reports more useful and engaging.</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {["KPI numbers in notification text", "Report image / achievement banner", "Employee or showroom thumbnail", "Open Report and Call action buttons", "Critical alert sound and priority channel", "Deep link to exact client, visit or report"].map((item) => <div key={item} className="flex items-center gap-2 rounded-xl border border-border/70 p-3"><Zap className="h-4 w-4 text-red-600 shrink-0" /><span className="font-medium">{item}</span></div>)}
              <p className="text-xs text-muted-foreground rounded-xl bg-muted/60 p-3">KPI text and deep links are supported now. Big-picture images and native action buttons require an Android/FCM payload upgrade before they should be enabled in production.</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Threshold Configs */}
      {activeSection === "rules" && (
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Sliders className="h-5 w-5 text-amber-500" /> Business Alert Thresholds
          </CardTitle>
          <CardDescription>
            Configure activity limits, inactivity days, and target percentages that trigger MD alerts.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Executive Inactivity Escalation (Days)</Label>
            <Input
              type="number"
              value={thresholds.executive_inactivity_days || 5}
              onChange={(e) => setThresholds({ ...thresholds, executive_inactivity_days: parseFloat(e.target.value) || 0 })}
              className="rounded-xl text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Partner Overdue Visit Alert (Days)</Label>
            <Input
              type="number"
              value={thresholds.partner_overdue_days || 15}
              onChange={(e) => setThresholds({ ...thresholds, partner_overdue_days: parseFloat(e.target.value) || 0 })}
              className="rounded-xl text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Low Performance Target Warning (%)</Label>
            <Input
              type="number"
              value={thresholds.low_performance_pct_max || 50}
              onChange={(e) => setThresholds({ ...thresholds, low_performance_pct_max: parseFloat(e.target.value) || 0 })}
              className="rounded-xl text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">No Client Visit Alert (Days)</Label>
            <Input
              type="number"
              value={thresholds.no_client_visit_days || 30}
              onChange={(e) => setThresholds({ ...thresholds, no_client_visit_days: parseFloat(e.target.value) || 0 })}
              className="rounded-xl text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Pending Quotation Follow-up (Days)</Label>
            <Input
              type="number"
              value={thresholds.quotation_pending_days || 7}
              onChange={(e) => setThresholds({ ...thresholds, quotation_pending_days: parseFloat(e.target.value) || 0 })}
              className="rounded-xl text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Overdue Client Follow-up (Days)</Label>
            <Input
              type="number"
              value={thresholds.followup_overdue_days || 3}
              onChange={(e) => setThresholds({ ...thresholds, followup_overdue_days: parseFloat(e.target.value) || 0 })}
              className="rounded-xl text-xs"
            />
          </div>
        </CardContent>
      </Card>
      )}

      {/* Scheduled Report Delivery Timings */}
      {activeSection === "schedule" && (<>
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" /> Scheduled Report Delivery Timings
          </CardTitle>
          <CardDescription>
            Customize the exact hours when daily & weekly management summary reports are sent to your phone.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Morning Sales Plan Time</Label>
            <Input
              type="time"
              value={timings.morning_plan_time || "08:30"}
              onChange={(e) => setTimings({ ...timings, morning_plan_time: e.target.value })}
              className="rounded-xl text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Daily Business Summary Time</Label>
            <Input
              type="time"
              value={timings.daily_summary_time || "19:00"}
              onChange={(e) => setTimings({ ...timings, daily_summary_time: e.target.value })}
              className="rounded-xl text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">End-of-Day (DSR) Report Time</Label>
            <Input
              type="time"
              value={timings.dsr_report_time || "20:00"}
              onChange={(e) => setTimings({ ...timings, dsr_report_time: e.target.value })}
              className="rounded-xl text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Weekly Report Time</Label>
            <Input
              type="time"
              value={timings.weekly_report_time || "20:00"}
              onChange={(e) => setTimings({ ...timings, weekly_report_time: e.target.value })}
              className="rounded-xl text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* 🚀 Manual Force Run Scheduled MD Reports */}
      <Card className="border-red-200 dark:border-red-900/50 bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2 text-red-600 dark:text-red-400">
            <Clock className="h-5 w-5" /> ⚡ Test & Force Run Scheduled MD Reports
          </CardTitle>
          <CardDescription>
            Instantly dispatch daily automated report notifications to all MDs and Admins (push status bar alert + notification center).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button
            onClick={async () => {
              toast.loading("Sending Morning Sales Plan to all MDs...");
              const res = await triggerMorningSalesPlanReport();
              toast.dismiss();
              if (res.success) {
                toast.success(`🌅 Morning Sales Plan sent to ${res.count} MDs!`);
              } else {
                toast.error(`Error: ${res.error}`);
              }
            }}
            variant="outline"
            className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 font-bold text-xs h-11 rounded-xl"
          >
            🌅 Run Morning Plan (8:30 AM)
          </Button>

          <Button
            onClick={async () => {
              toast.loading("Sending Daily Business Summary to all MDs...");
              const res = await triggerDailyBusinessSummaryReport();
              toast.dismiss();
              if (res.success) {
                toast.success(`🌆 Daily Business Summary sent to ${res.count} MDs!`);
              } else {
                toast.error(`Error: ${res.error}`);
              }
            }}
            variant="outline"
            className="border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10 font-bold text-xs h-11 rounded-xl"
          >
            🌆 Run Daily Summary (7:00 PM)
          </Button>

          <Button
            onClick={async () => {
              toast.loading("Sending EOD DSR Report to all MDs...");
              const res = await triggerEODDSRReport();
              toast.dismiss();
              if (res.success) {
                toast.success(`📊 EOD DSR Report sent to ${res.count} MDs!`);
              } else {
                toast.error(`Error: ${res.error}`);
              }
            }}
            variant="outline"
            className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 font-bold text-xs h-11 rounded-xl"
          >
            📊 Run EOD DSR Report (8:00 PM)
          </Button>

          <Button
            onClick={async () => {
              toast.loading("Sending Inactivity Escalation Alert to all MDs...");
              const res = await triggerInactivityEscalationReport();
              toast.dismiss();
              if (res.success) {
                toast.success(`🚨 Inactivity Alert sent to ${res.count} MDs!`);
              } else {
                toast.error(`Error: ${res.error}`);
              }
            }}
            variant="outline"
            className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10 font-bold text-xs h-11 rounded-xl"
          >
            🚨 Run 5-Day Inactivity Alert
          </Button>

          <Button
            onClick={async () => {
              toast.loading("Sending Partner Overdue Alert to all MDs...");
              const res = await triggerPartnerOverdueReport();
              toast.dismiss();
              if (res.success) {
                toast.success(`🤝 Partner Overdue Alert sent to ${res.count} MDs!`);
              } else {
                toast.error(`Error: ${res.error}`);
              }
            }}
            variant="outline"
            className="border-sky-500/40 text-sky-300 hover:bg-sky-500/10 font-bold text-xs h-11 rounded-xl"
          >
            🤝 Run 15-Day Partner Alert
          </Button>

          <Button
            onClick={async () => {
              toast.loading("Sending GPS Location Exception Alert to all MDs...");
              const res = await triggerGPSMisalignmentReport();
              toast.dismiss();
              if (res.success) {
                toast.success(`📍 GPS Exception Alert sent to ${res.count} MDs!`);
              } else {
                toast.error(`Error: ${res.error}`);
              }
            }}
            variant="outline"
            className="border-purple-500/40 text-purple-300 hover:bg-purple-500/10 font-bold text-xs h-11 rounded-xl"
          >
            📍 Run GPS Exception Alert
          </Button>

          <Button
            onClick={async () => {
              toast.loading("Sending Start Day Reminder to all non-MD/Admin staff...");
              const res = await triggerStartDayReminder();
              toast.dismiss();
              if (res.success) {
                toast.success(`☀️ Start Day Reminder sent to ${res.count} field staff!`);
              } else {
                toast.error(`Error: ${res.error}`);
              }
            }}
            variant="outline"
            className="border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/10 font-bold text-xs h-11 rounded-xl"
          >
            ☀️ Run Start Day Reminder (09:30 AM)
          </Button>

          <Button
            onClick={async () => {
              toast.loading("Sending End Day Reminder to all non-MD/Admin staff...");
              const res = await triggerEndDayReminder();
              toast.dismiss();
              if (res.success) {
                toast.success(`🌙 End Day Reminder sent to ${res.count} field staff!`);
              } else {
                toast.error(`Error: ${res.error}`);
              }
            }}
            variant="outline"
            className="border-orange-500/40 text-orange-300 hover:bg-orange-500/10 font-bold text-xs h-11 rounded-xl"
          >
            🌙 Run End Day Reminder (09:30 PM)
          </Button>
        </CardContent>
      </Card>
      </>)}

      {/* 20 Notification Toggles */}
      {activeSection === "modules" && (
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" /> 20 Notification Report Modules
          </CardTitle>
          <CardDescription>
            Enable or disable specific automated reports and event notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border/60">
          {notificationTypes.map((item) => (
            <div key={item.key} className="py-3 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold">{item.label}</p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground uppercase">
                  {item.category}
                </span>
              </div>
              <Switch
                checked={toggles[item.key] ?? true}
                onCheckedChange={(val) => setToggles({ ...toggles, [item.key]: val })}
              />
            </div>
          ))}
        </CardContent>
      </Card>
      )}

    </div>
  );
}
