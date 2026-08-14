import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Sliders, Save, ShieldAlert, BellRing, Settings, Loader2, Clock, MessageSquareShare } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function NotificationSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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

  // Fetch preferences from Supabase
  const { data: prefs, isLoading } = useQuery({
    queryKey: ["notification-preferences", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_preferences" as any)
        .select("*")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (error && error.code !== "42P01") throw error;
      return data;
    },
  });

  useEffect(() => {
    if (prefs) {
      if (prefs.enabled_notifications) {
        setToggles((prev) => ({ ...prev, ...(prefs.enabled_notifications as any) }));
      }
      if (prefs.thresholds) {
        setThresholds((prev) => ({ ...prev, ...(prefs.thresholds as any) }));
      }
      if ((prefs as any).timings) {
        setTimings((prev) => ({ ...prev, ...((prefs as any).timings as any) }));
      }
    }
  }, [prefs]);

  // Save Preferences Mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return;
      const { error } = await supabase.from("notification_preferences" as any).upsert(
        {
          user_id: user.id,
          enabled_notifications: toggles,
          thresholds,
          timings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      toast.success("Notification preferences saved!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save preferences");
    },
  });

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

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      
      {/* Header */}
      <div className="flex items-center justify-between gap-4 bg-card p-5 rounded-2xl border border-border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Notification Settings & Thresholds</h1>
            <p className="text-xs text-muted-foreground">
              Configure alert rules, automated report triggers, and business escalation thresholds.
            </p>
          </div>
        </div>

        <Button
          variant="default"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="gap-2 font-bold shadow-md shrink-0"
        >
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Settings
        </Button>
      </div>

      {/* Threshold Configs */}
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

      {/* Scheduled Report Delivery Timings */}
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

      {/* 20 Notification Toggles */}
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

    </div>
  );
}
