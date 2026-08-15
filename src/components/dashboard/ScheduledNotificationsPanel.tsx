import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sendNotification } from "@/lib/notifications";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Calendar, Send, Users, Building, User, Trash2, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";

export function ScheduledNotificationsPanel() {
  const queryClient = useQueryClient();
  const [targetType, setTargetType] = useState<"broadcast" | "showroom" | "individual">("broadcast");
  const [targetShowroomId, setTargetShowroomId] = useState<string>("");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [clickActionPath, setClickActionPath] = useState<string>("/");
  const [scheduledFor, setScheduledFor] = useState("");
  const [saving, setSaving] = useState(false);
  const [recurrence, setRecurrence] = useState<string>("one_time");

  // 1. Fetch Showrooms for dropdown
  const { data: showrooms = [] } = useQuery({
    queryKey: ["showrooms-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("showrooms").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // 2. Fetch Employees for dropdown
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-list"],
    queryFn: async () => {
      const { data: profiles, error: pError } = await supabase
        .from("profiles")
        .select("user_id, full_name");
      
      const { data: roles, error: rError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (pError) throw pError;
      if (rError) throw rError;

      return (profiles || []).map((profile) => {
        const roleObj = (roles || []).find((r) => r.user_id === profile.user_id);
        return {
          user_id: profile.user_id,
          full_name: profile.full_name || "Unknown",
          role: roleObj?.role || "executive",
        };
      });
    },
  });

  // 3. Fetch Scheduled Notifications Queue
  const { data: scheduledList = [], isLoading: listLoading } = useQuery({
    queryKey: ["scheduled-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_notifications" as any)
        .select("*")
        .order("scheduled_for", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // --- Automatic Background Dispatcher Worker ---
  useEffect(() => {
    const processScheduledQueue = async () => {
      try {
        const { data: dueNotifs, error } = await supabase
          .from("scheduled_notifications" as any)
          .select("*")
          .eq("status", "pending")
          .lte("scheduled_for", new Date().toISOString());

        if (error || !dueNotifs || (dueNotifs as any[]).length === 0) return;

        for (const item of (dueNotifs as any[])) {
          // Mark status as 'sending'
          await supabase
            .from("scheduled_notifications" as any)
            .update({ status: "sending" } as any)
            .eq("id", item.id);

          try {
            let targetUserIds: string[] = [];
            if (item.target_type === "broadcast") {
              const { data: allProfiles } = await supabase.from("profiles" as any).select("user_id");
              targetUserIds = (allProfiles || []).map((p: any) => p.user_id);
            } else if (item.target_type === "showroom" && item.target_id) {
              const { data: showEmp } = await supabase
                .from("user_roles" as any)
                .select("user_id")
                .eq("showroom_id", item.target_id);
              targetUserIds = (showEmp || []).map((e: any) => e.user_id);
            } else if (item.target_type === "individual" && item.target_id) {
              targetUserIds = [item.target_id];
            }

            for (const uid of targetUserIds) {
              await sendNotification({
                userId: uid,
                title: item.title,
                message: item.body,
                targetUrl: item.target_url || "/",
              });
            }

            await supabase
              .from("scheduled_notifications" as any)
              .update({ status: "sent", sent_at: new Date().toISOString() } as any)
              .eq("id", item.id);

            toast.info(`Scheduled Notification '${item.title}' dispatched to phone status bar! 📱`);
          } catch (procErr: any) {
            await supabase
              .from("scheduled_notifications" as any)
              .update({ status: "failed", error_message: procErr.message } as any)
              .eq("id", item.id);
          }
        }

        queryClient.invalidateQueries({ queryKey: ["scheduled-notifications"] });
      } catch (err) {
        console.error("Scheduled worker error:", err);
      }
    };

    processScheduledQueue();
    const interval = setInterval(processScheduledQueue, 10000); // Check every 10s
    return () => clearInterval(interval);
  }, [queryClient]);

  // 4. Mutation to create scheduled notification
  const scheduleNotification = useMutation({
    mutationFn: async () => {
      if (!title.trim() || !body.trim() || !scheduledFor) {
        throw new Error("Please fill in all fields.");
      }

      const scheduleDate = new Date(scheduledFor);
      if (scheduleDate <= new Date()) {
        throw new Error("Scheduled time must be in the future.");
      }

      const insertData: any = {
        title: title.trim(),
        body: body.trim(),
        target_type: targetType,
        target_url: clickActionPath,
        scheduled_for: scheduleDate.toISOString(),
        status: "pending",
        recurrence: recurrence,
      };

      if (targetType === "showroom") {
        if (!targetShowroomId) throw new Error("Select a showroom.");
        insertData.target_id = targetShowroomId;
      } else if (targetType === "individual") {
        if (!targetUserId) throw new Error("Select an employee.");
        insertData.target_id = targetUserId;
      }

      const { error } = await supabase.from("scheduled_notifications" as any).insert(insertData);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notification scheduled successfully!");
      setTitle("");
      setBody("");
      setScheduledFor("");
      setRecurrence("one_time");
      queryClient.invalidateQueries({ queryKey: ["scheduled-notifications"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to schedule notification.");
    },
  });

  // 5. Mutation to cancel/delete pending notification
  const cancelNotification = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("scheduled_notifications" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Scheduled notification cancelled.");
      queryClient.invalidateQueries({ queryKey: ["scheduled-notifications"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to cancel notification.");
    },
  });

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    scheduleNotification.mutate();
  };

  const pendingQueue = scheduledList.filter((n) => {
    const st = (n.status || "pending").toLowerCase();
    const isFuture = n.scheduled_for ? new Date(n.scheduled_for) > new Date() : true;
    return (st === "pending" || st === "sending") && isFuture;
  });

  const completedLogs = scheduledList.filter((n) => {
    const st = (n.status || "").toLowerCase();
    const isPast = n.scheduled_for ? new Date(n.scheduled_for) <= new Date() : false;
    return st === "sent" || st === "failed" || isPast;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* ─── Scheduling Form ─── */}
      <Card className="lg:col-span-1 border-border/50 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-bold">
            <Calendar className="h-5 w-5 text-primary" /> Schedule Notification
          </CardTitle>
          <CardDescription>
            Plan a push notification to be sent to employees automatically at a future time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleScheduleSubmit} className="space-y-4">
            
            {/* Target Type Selector */}
            <div className="space-y-2">
              <Label>Recipient Type</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={targetType === "broadcast" ? "default" : "outline"}
                  className="w-full gap-1.5 text-xs sm:text-sm px-1"
                  onClick={() => setTargetType("broadcast")}
                >
                  <Users className="h-4 w-4" /> Broadcast
                </Button>
                <Button
                  type="button"
                  variant={targetType === "showroom" ? "default" : "outline"}
                  className="w-full gap-1.5 text-xs sm:text-sm px-1"
                  onClick={() => setTargetType("showroom")}
                >
                  <Building className="h-4 w-4" /> Showroom
                </Button>
                <Button
                  type="button"
                  variant={targetType === "individual" ? "default" : "outline"}
                  className="w-full gap-1.5 text-xs sm:text-sm px-1"
                  onClick={() => setTargetType("individual")}
                >
                  <User className="h-4 w-4" /> Individual
                </Button>
              </div>
            </div>

            {/* Conditional Dropdown for Showroom */}
            {targetType === "showroom" && (
              <div className="space-y-2 animate-fade-in">
                <Label htmlFor="sched-showroom-select">Select Showroom</Label>
                <Select value={targetShowroomId} onValueChange={setTargetShowroomId}>
                  <SelectTrigger id="sched-showroom-select">
                    <SelectValue placeholder="Choose a showroom..." />
                  </SelectTrigger>
                  <SelectContent>
                    {showrooms.map((showroom: any) => (
                      <SelectItem key={showroom.id} value={showroom.id}>
                        {showroom.name} ({showroom.city})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Conditional Dropdown for Individual */}
            {targetType === "individual" && (
              <div className="space-y-2 animate-fade-in">
                <Label htmlFor="sched-employee-select">Select Employee</Label>
                <Select value={targetUserId} onValueChange={setTargetUserId}>
                  <SelectTrigger id="sched-employee-select">
                    <SelectValue placeholder="Choose an employee..." />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp: any) => (
                      <SelectItem key={emp.user_id} value={emp.user_id}>
                        {emp.full_name} ({emp.role.toUpperCase()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Notification Title */}
            <div className="space-y-2">
              <Label htmlFor="sched-notif-title">Title</Label>
              <Input
                id="sched-notif-title"
                placeholder="e.g. Daily Meeting Reminder! 📋"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                required
              />
            </div>

            {/* Notification Body */}
            <div className="space-y-2">
              <Label htmlFor="sched-notif-body">Message</Label>
              <Textarea
                id="sched-notif-body"
                placeholder="Type your message description here..."
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={250}
                required
              />
            </div>

            {/* Action on Click */}
            <div className="space-y-2">
              <Label htmlFor="sched-notif-action">On Click: Open Page</Label>
              <Select value={clickActionPath} onValueChange={setClickActionPath}>
                <SelectTrigger id="sched-notif-action">
                  <SelectValue placeholder="Choose page to open..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="/">Home / Dashboard</SelectItem>
                  <SelectItem value="/visits">Visits / Meetings</SelectItem>
                  <SelectItem value="/my-pipeline">My Pipeline</SelectItem>
                  <SelectItem value="/reports">Reports & Analytics</SelectItem>
                  <SelectItem value="/md-dashboard">MD Dashboard</SelectItem>
                  <SelectItem value="/conveyance">Conveyance / Expenses</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Recurrence Selector */}
            <div className="space-y-2">
              <Label htmlFor="sched-notif-recurrence">Recurrence</Label>
              <Select value={recurrence} onValueChange={setRecurrence}>
                <SelectTrigger id="sched-notif-recurrence">
                  <SelectValue placeholder="Select frequency..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One-time</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="fifteen_days">Every 15 Days</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date-Time Picker */}
            <div className="space-y-2">
              <Label htmlFor="sched-notif-time">Send At (Date & Time)</Label>
              <Input
                id="sched-notif-time"
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={scheduleNotification.isPending}
            >
              {scheduleNotification.isPending ? "Scheduling..." : "Schedule Notification"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ─── Queue and History lists ─── */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Pending Queue */}
        <Card className="border-border/50 shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" /> Pending Queue
            </CardTitle>
            <CardDescription>Scheduled notifications waiting to be sent.</CardDescription>
          </CardHeader>
          <CardContent>
            {listLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading queue...</p>
            ) : pendingQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No notifications currently scheduled.</p>
            ) : (
              <div className="divide-y divide-border/40">
                {pendingQueue.map((item) => (
                  <div key={item.id} className="py-3 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="font-semibold text-sm">{item.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.body}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1.5 text-[11px] text-muted-foreground/80">
                        <span className="capitalize">Target: {item.target_type}</span>
                        <span>Open path: {item.target_url}</span>
                        {item.recurrence && item.recurrence !== 'one_time' && (
                          <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] capitalize font-medium">
                            🔄 {item.recurrence.replace('_', ' ')}
                          </span>
                        )}
                        <span className="font-semibold text-primary">
                          Scheduled for: {format(parseISO(item.scheduled_for), "dd MMM yyyy, hh:mm a")}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => cancelNotification.mutate(item.id)}
                      disabled={cancelNotification.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* History Log */}
        <Card className="border-border/50 shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" /> Dispatch History
            </CardTitle>
            <CardDescription>History of sent and failed scheduled notifications.</CardDescription>
          </CardHeader>
          <CardContent>
            {listLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading history...</p>
            ) : completedLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No previous history log available.</p>
            ) : (
              <div className="divide-y divide-border/40 max-h-[350px] overflow-y-auto">
                {completedLogs.map((item) => (
                  <div key={item.id} className="py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm">{item.title}</p>
                          {item.status === "sent" ? (
                            <span className="text-[10px] bg-green-500/10 text-green-500 font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" /> Sent
                            </span>
                          ) : (
                            <span className="text-[10px] bg-destructive/10 text-destructive font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Failed
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{item.body}</p>
                        {item.error_message && (
                          <p className="text-[11px] text-destructive italic font-mono bg-destructive/5 p-1 rounded">
                            Error: {item.error_message}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1.5 text-[10px] text-muted-foreground/80">
                          <span className="capitalize">Target: {item.target_type}</span>
                          {item.recurrence && item.recurrence !== 'one_time' && (
                            <span className="bg-muted text-muted-foreground px-1 py-0.5 rounded text-[9px] capitalize font-medium">
                              🔄 {item.recurrence.replace('_', ' ')}
                            </span>
                          )}
                          <span>Dispatched: {format(parseISO(item.scheduled_for), "dd MMM, hh:mm a")}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

    </div>
  );
}
