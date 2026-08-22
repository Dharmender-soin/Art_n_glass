import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, startOfDay, subDays } from "date-fns";
import { Activity, BellRing, CheckCircle2, Eye, RefreshCw, Search, Send, Smartphone, TriangleAlert } from "lucide-react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type Dispatch = {
  id: string;
  title: string;
  body: string;
  source: string;
  style: string;
  target_type: string;
  status: string;
  recipient_count: number;
  device_count: number;
  success_count: number;
  failure_count: number;
  created_at: string;
  error_message?: string | null;
};

export default function NotificationLogs() {
  const { role, loading } = useAuth();
  const [range, setRange] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const dispatchQuery = useQuery({
    queryKey: ["notification-dispatch-logs", range, status],
    enabled: role === "admin" || role === "md",
    queryFn: async () => {
      let query = supabase
        .from("notification_dispatches" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (range === "today") query = query.gte("created_at", startOfDay(new Date()).toISOString());
      if (range === "7d") query = query.gte("created_at", subDays(new Date(), 7).toISOString());
      if (status !== "all") query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Dispatch[];
    },
  });

  const deliveryQuery = useQuery({
    queryKey: ["notification-delivery-summary", range],
    enabled: role === "admin" || role === "md",
    queryFn: async () => {
      let query = supabase.from("notification_delivery_logs" as any).select("status, created_at").limit(1000);
      if (range === "today") query = query.gte("created_at", startOfDay(new Date()).toISOString());
      if (range === "7d") query = query.gte("created_at", subDays(new Date(), 7).toISOString());
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Array<{ status: string; created_at: string }>;
    },
  });

  const scheduledQuery = useQuery({
    queryKey: ["scheduled-notification-fallback", range],
    enabled: role === "admin" || role === "md",
    queryFn: async () => {
      let query = supabase
        .from("scheduled_notifications" as any)
        .select("id, title, body, target_type, target_id, status, scheduled_for, created_at, error_message")
        .order("created_at", { ascending: false })
        .limit(200);
      if (range === "today") query = query.gte("created_at", startOfDay(new Date()).toISOString());
      if (range === "7d") query = query.gte("created_at", subDays(new Date(), 7).toISOString());
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const fallbackDispatches: Dispatch[] = (scheduledQuery.data || []).map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    source: "scheduled",
    style: "standard",
    target_type: item.target_type,
    status: item.status,
    recipient_count: item.target_type === "individual" ? 1 : 0,
    device_count: 0,
    success_count: item.status === "sent" ? 1 : 0,
    failure_count: item.status === "failed" ? 1 : 0,
    created_at: item.created_at || item.scheduled_for,
    error_message: item.error_message,
  }));
  const effectiveDispatches = dispatchQuery.error ? fallbackDispatches : (dispatchQuery.data || []);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return effectiveDispatches;
    return effectiveDispatches.filter((item) =>
      `${item.title} ${item.body} ${item.source} ${item.target_type}`.toLowerCase().includes(term)
    );
  }, [effectiveDispatches, search]);

  if (loading || !role) {
    return <div className="flex min-h-[45vh] items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (role !== "admin" && role !== "md") return <Navigate to="/notifications" replace />;

  const deliveries = deliveryQuery.data || [];
  const totalRecipients = effectiveDispatches.reduce((sum, item) => sum + item.recipient_count, 0);
  const sent = deliveryQuery.error
    ? effectiveDispatches.filter((item) => item.status === "sent").length
    : deliveries.filter((item) => ["sent", "received", "opened"].includes(item.status)).length;
  const opened = deliveries.filter((item) => item.status === "opened").length;
  const failed = deliveries.filter((item) => item.status === "failed").length;
  const schemaUnavailable = dispatchQuery.error || deliveryQuery.error;

  const metrics = [
    { label: schemaUnavailable ? "Queue history" : "Generated", value: effectiveDispatches.length, icon: BellRing, tone: "text-primary bg-primary/10" },
    { label: schemaUnavailable ? "Intended recipients" : "Recipients", value: totalRecipients, icon: Send, tone: "text-blue-600 bg-blue-500/10" },
    { label: schemaUnavailable ? "Marked sent" : "Push sent", value: sent, icon: Smartphone, tone: "text-emerald-600 bg-emerald-500/10" },
    { label: schemaUnavailable ? "Open data unavailable" : "Opened", value: opened, icon: Eye, tone: "text-violet-600 bg-violet-500/10" },
    { label: schemaUnavailable ? "Marked failed" : "Failed", value: failed, icon: TriangleAlert, tone: "text-rose-600 bg-rose-500/10" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-3 sm:p-5 lg:p-7">
      <section className="rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] via-background to-background p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Notification operations</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Delivery Logs</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">A clear audit trail for every notification, from campaign creation to opening it on a phone.</p>
          </div>
          <Button variant="outline" onClick={() => { dispatchQuery.refetch(); deliveryQuery.refetch(); }}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </section>

      {schemaUnavailable && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <strong>Basic schedule history mode.</strong> These figures represent scheduled queue records, not confirmed FCM delivery. Exact sent, received, and opened tracking will be available after deploying the notification migration and updated push function.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="rounded-2xl shadow-sm"><CardContent className="p-4">
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon className="h-4 w-4" /></div>
            <p className="text-2xl font-black">{value.toLocaleString()}</p><p className="text-xs font-medium text-muted-foreground">{label}</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_150px_150px]">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="h-10 pl-9" placeholder="Search by title, source, or target..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <Select value={range} onValueChange={setRange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">Today</SelectItem><SelectItem value="7d">Last 7 days</SelectItem><SelectItem value="all">All time</SelectItem></SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All status</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="partial">Partial</SelectItem><SelectItem value="failed">Failed</SelectItem><SelectItem value="sending">Sending</SelectItem></SelectContent></Select>
      </div>

      <div className="space-y-3">
        {rows.map((item) => (
          <Card key={item.id} className="rounded-2xl transition-shadow hover:shadow-md"><CardContent className="p-4 sm:p-5">
            <div className="flex gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Activity className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div><h2 className="font-bold leading-tight">{item.title}</h2><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.body}</p></div>
                  <Badge variant={item.status === "failed" ? "destructive" : "secondary"} className="w-fit capitalize">{item.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="capitalize">{item.source} · {item.style}</span><span>{item.target_type}</span><span>{item.recipient_count} recipients</span><span><CheckCircle2 className="mr-1 inline h-3 w-3" />{item.success_count} sent</span>{item.failure_count > 0 && <span className="text-destructive">{item.failure_count} failed</span>}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground" title={format(new Date(item.created_at), "PPpp")}>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</p>
              </div>
            </div>
          </CardContent></Card>
        ))}
        {!scheduledQuery.isLoading && rows.length === 0 && (
          <div className="rounded-3xl border border-dashed p-12 text-center"><BellRing className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-semibold">No notification dispatches match this filter.</p></div>
        )}
      </div>
    </div>
  );
}
