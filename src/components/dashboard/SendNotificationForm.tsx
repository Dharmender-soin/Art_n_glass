import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, Users, Building, User, UserCog, Image as ImageIcon, Sparkles } from "lucide-react";
import type { NotificationCategory, NotificationPriority } from "@/lib/notifications";
import {
  extractNotificationVariables,
  notificationTemplates,
  notificationVariables,
  renderNotificationPreview,
  type NotificationStyle,
} from "@/lib/notificationTemplates";

export function SendNotificationForm() {
  const [targetType, setTargetType] = useState<"broadcast" | "showroom" | "role" | "individual">("broadcast");
  const [targetShowroomId, setTargetShowroomId] = useState<string>("");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [targetRole, setTargetRole] = useState<string>("executive");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<NotificationCategory>("informational");
  const [priority, setPriority] = useState<NotificationPriority>("normal");
  const [clickActionPath, setClickActionPath] = useState<string>("/");
  const [templateKey, setTemplateKey] = useState("custom");
  const [style, setStyle] = useState<NotificationStyle>("standard");
  const [imageUrl, setImageUrl] = useState("");
  const [sending, setSending] = useState(false);

  const applyTemplate = (key: string) => {
    setTemplateKey(key);
    const template = notificationTemplates.find((item) => item.key === key);
    if (!template) return;
    setTitle(template.title);
    setBody(template.body);
    setCategory(template.category);
    setPriority(template.priority as NotificationPriority);
    setStyle(template.style);
    setClickActionPath(template.targetUrl);
  };

  const insertVariable = (key: string) => {
    const token = `{{${key}}}`;
    setBody((current) => `${current}${current ? " " : ""}${token}`);
  };

  // 1. Fetch Showrooms for dropdown
  const { data: showrooms = [] } = useQuery({
    queryKey: ["showrooms-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("showrooms").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // 2. Fetch Users (Profiles + Roles) for individual selection
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-list"],
    queryFn: async () => {
      const { data: profiles, error: pError } = await supabase
        .from("profiles")
        .select("user_id, full_name");
      
      const { data: roles, error: rError } = await supabase
        .from("user_roles")
        .select("user_id, role, showroom_id");

      if (pError) throw pError;
      if (rError) throw rError;

      // Merge profiles with roles
      return (profiles || []).map((profile) => {
        const roleObj = (roles || []).find((r) => r.user_id === profile.user_id);
        return {
          user_id: profile.user_id,
          full_name: profile.full_name || "Unknown",
          role: roleObj?.role || "executive",
          showroom_id: roleObj?.showroom_id,
        };
      });
    },
  });

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error("Please fill in both Title and Message body.");
      return;
    }

    if (targetType === "showroom" && !targetShowroomId) {
      toast.error("Please select a target Showroom.");
      return;
    }

    if (targetType === "individual" && !targetUserId) {
      toast.error("Please select a target Employee.");
      return;
    }

    setSending(true);
    try {
      // Build request body
      const payload: any = {
        title: title.trim(),
        body: body.trim(),
        category,
        priority,
        notificationType: "manual_broadcast",
        source: "manual",
        style,
        imageUrl: imageUrl.trim() || undefined,
        templateKey: templateKey === "custom" ? undefined : templateKey,
        variables: extractNotificationVariables(title, body),
        data: {
          targetUrl: clickActionPath,
          category,
          priority,
        }
      };

      if (targetType === "broadcast") {
        payload.broadcast = true;
      } else if (targetType === "showroom") {
        payload.showroomId = targetShowroomId;
      } else if (targetType === "role") {
        payload.role = targetRole;
      } else {
        payload.userId = targetUserId;
      }

      // Call Supabase Edge Function
      const { data, error } = await supabase.functions.invoke("send-push-notification", {
        body: payload,
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        const recipients = data.recipients_count || 0;
        const devices = data.results_count || 0;
        toast.success(`Saved for ${recipients} users and pushed to ${devices} active devices.`);
        // Reset form
        setTitle("");
        setBody("");
      } else {
        toast.error(data?.message || "Failed to send notifications.");
      }
    } catch (err: any) {
      console.error("Error sending notification:", err);
      toast.error(err.message || "An unexpected error occurred.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="border-border/50 shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-bold">
          <Send className="h-5 w-5 text-primary" /> Send Push Notification
        </CardTitle>
        <CardDescription>
          Send a native push notification to employees' mobile devices instantly.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSend} className="space-y-4">
          
          {/* Target Type Selector */}
          <div className="space-y-2">
            <Label>Recipient Type</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Button
                type="button"
                variant={targetType === "role" ? "default" : "outline"}
                className="w-full gap-1.5 text-xs sm:text-sm"
                onClick={() => setTargetType("role")}
              >
                <UserCog className="h-4 w-4" /> Role
              </Button>
              <Button
                type="button"
                variant={targetType === "broadcast" ? "default" : "outline"}
                className="w-full gap-1.5 text-xs sm:text-sm"
                onClick={() => setTargetType("broadcast")}
              >
                <Users className="h-4 w-4" /> Broadcast (All)
              </Button>
              <Button
                type="button"
                variant={targetType === "showroom" ? "default" : "outline"}
                className="w-full gap-1.5 text-xs sm:text-sm"
                onClick={() => setTargetType("showroom")}
              >
                <Building className="h-4 w-4" /> Showroom
              </Button>
              <Button
                type="button"
                variant={targetType === "individual" ? "default" : "outline"}
                className="w-full gap-1.5 text-xs sm:text-sm"
                onClick={() => setTargetType("individual")}
              >
                <User className="h-4 w-4" /> Individual
              </Button>
            </div>
          </div>

          {/* Conditional Dropdown for Showroom */}
          {targetType === "showroom" && (
            <div className="space-y-2 animate-fade-in">
              <Label htmlFor="showroom-select">Select Showroom</Label>
              <Select value={targetShowroomId} onValueChange={setTargetShowroomId}>
                <SelectTrigger id="showroom-select">
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
              <Label htmlFor="employee-select">Select Employee</Label>
              <Select value={targetUserId} onValueChange={setTargetUserId}>
                <SelectTrigger id="employee-select">
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

          {targetType === "role" && (
            <div className="space-y-2 animate-fade-in">
              <Label htmlFor="role-select">Select Role</Label>
              <Select value={targetRole} onValueChange={setTargetRole}>
                <SelectTrigger id="role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="md">Managing Directors</SelectItem>
                  <SelectItem value="admin">Admins</SelectItem>
                  <SelectItem value="manager">Managers</SelectItem>
                  <SelectItem value="tl">Team Leaders</SelectItem>
                  <SelectItem value="accountant">Accountants</SelectItem>
                  <SelectItem value="executive">Executives</SelectItem>
                  <SelectItem value="backhand_executive">Backhand Executives</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="notif-template">Template</Label>
              <Select value={templateKey} onValueChange={applyTemplate}>
                <SelectTrigger id="notif-template"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom notification</SelectItem>
                  {notificationTemplates.map((template) => (
                    <SelectItem key={template.key} value={template.key}>{template.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notif-style">Phone style</Label>
              <Select value={style} onValueChange={(value) => setStyle(value as NotificationStyle)}>
                <SelectTrigger id="notif-style"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="report">KPI report</SelectItem>
                  <SelectItem value="celebration">Celebration</SelectItem>
                  <SelectItem value="critical">Critical alert</SelectItem>
                  <SelectItem value="image">Image / banner</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="notif-category">Category</Label>
              <Select value={category} onValueChange={(value) => setCategory(value as NotificationCategory)}>
                <SelectTrigger id="notif-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="important">Important</SelectItem>
                  <SelectItem value="report">Report</SelectItem>
                  <SelectItem value="reminder">Reminder</SelectItem>
                  <SelectItem value="informational">Informational</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notif-priority">Priority</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as NotificationPriority)}>
                <SelectTrigger id="notif-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notification Title */}
          <div className="space-y-2">
            <Label htmlFor="notif-title">Title</Label>
            <Input
              id="notif-title"
              placeholder="e.g. New Visit Assigned! 📋"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
          </div>

          {/* Notification Body */}
          <div className="space-y-2">
            <Label htmlFor="notif-body">Message</Label>
            <Textarea
              id="notif-body"
              placeholder="Type notification description/message here..."
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={250}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {notificationVariables.map((variable) => (
                <Button
                  key={variable.key}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full px-2 text-[11px]"
                  onClick={() => insertVariable(variable.key)}
                >
                  + {variable.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Automatic and scheduled templates can populate these keys with live report data; the preview uses sample values.</p>
          </div>

          {style === "image" && (
            <div className="space-y-2">
              <Label htmlFor="notif-image" className="flex items-center gap-1.5"><ImageIcon className="h-4 w-4" /> HTTPS image URL</Label>
              <Input id="notif-image" type="url" placeholder="https://.../report-banner.jpg" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} />
              <p className="text-xs text-muted-foreground">The banner appears in the expanded Android notification. An HTTPS URL is required.</p>
            </div>
          )}

          {/* Action on Click (Deep Link Page) */}
          <div className="space-y-2 animate-fade-in">
            <Label htmlFor="notif-action">On Click: Open Page</Label>
            <Select value={clickActionPath} onValueChange={setClickActionPath}>
              <SelectTrigger id="notif-action">
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

          <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] to-background p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
              <Sparkles className="h-4 w-4" /> Phone preview · {style}
            </div>
            <div className="rounded-2xl border bg-background p-3 shadow-sm">
              <p className="text-sm font-bold">{renderNotificationPreview(title) || "Notification title"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{renderNotificationPreview(body) || "Notification message preview"}</p>
              {style === "image" && imageUrl && <img src={imageUrl} alt="Notification banner preview" className="mt-3 max-h-32 w-full rounded-xl object-cover" />}
            </div>
          </div>

          {/* Action Button */}
          <Button type="submit" className="w-full" disabled={sending}>
            {sending ? "Sending..." : "Send Notification"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
