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
import { Send, Users, Building, User } from "lucide-react";

export function SendNotificationForm() {
  const [targetType, setTargetType] = useState<"broadcast" | "showroom" | "individual">("broadcast");
  const [targetShowroomId, setTargetShowroomId] = useState<string>("");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [clickActionPath, setClickActionPath] = useState<string>("/");
  const [sending, setSending] = useState(false);

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
        data: {
          targetUrl: clickActionPath
        }
      };

      if (targetType === "broadcast") {
        payload.broadcast = true;
      } else if (targetType === "showroom") {
        payload.showroomId = targetShowroomId;
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
        const count = data.results_count || 0;
        toast.success(`Notification sent successfully to ${count} active devices!`);
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
            <div className="grid grid-cols-3 gap-2">
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
          </div>

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

          {/* Action Button */}
          <Button type="submit" className="w-full" disabled={sending}>
            {sending ? "Sending..." : "Send Notification"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
