import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Shield, MapPin, Users } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const Admin = () => {
  const { role } = useAuth();

  const queryClient = useQueryClient();

  const { data: showrooms = [] } = useQuery({
    queryKey: ["showrooms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("showrooms").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: userRoles = [] } = useQuery({
    queryKey: ["all-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("*, profiles:user_id(full_name, phone)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: role === "admin",
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, newRole, showroomId }: { id: string; newRole?: AppRole; showroomId?: string | null }) => {
      const updateData: any = {};
      if (newRole) updateData.role = newRole;
      if (showroomId !== undefined) updateData.showroom_id = showroomId || null;
      const { error } = await supabase.from("user_roles").update(updateData).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-user-roles"] });
      toast.success("User updated!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (role !== "admin") {
    return <p className="text-center text-muted-foreground py-8">Access denied. Admin only.</p>;
  }

  const roleColor: Record<string, string> = {
    admin: "bg-primary text-primary-foreground",
    manager: "bg-[hsl(var(--status-hot))] text-white",
    executive: "bg-[hsl(var(--status-new))] text-white",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          User Management
        </h1>
        <p className="text-sm text-muted-foreground">Manage roles and showroom assignments</p>
      </div>

      {/* Showrooms overview */}
      <div className="grid gap-3 md:grid-cols-3">
        {showrooms.map((s) => {
          const count = userRoles.filter((r) => r.showroom_id === s.id).length;
          return (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />{s.city}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground">Users</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* User list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Users ({userRoles.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {userRoles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No users found.</p>
          ) : (
            <div className="space-y-3">
              {userRoles.map((ur) => {
                const profile = ur.profiles as any;
                const showroom = showrooms.find((s) => s.id === ur.showroom_id);
                return (
                  <div key={ur.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border p-4">
                    <div className="flex-1">
                      <p className="font-medium">{profile?.full_name || "Unnamed User"}</p>
                      <p className="text-xs text-muted-foreground">{profile?.phone || "No phone"}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge className={`${roleColor[ur.role] || ""} text-xs border-0 capitalize`}>{ur.role}</Badge>
                        {showroom && (
                          <Badge variant="outline" className="text-xs">
                            <MapPin className="h-3 w-3 mr-1" />{showroom.name}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Select
                        value={ur.role}
                        onValueChange={(v) => updateRole.mutate({ id: ur.id, newRole: v as AppRole })}
                      >
                        <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-popover">
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="executive">Executive</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={ur.showroom_id || "none"}
                        onValueChange={(v) => updateRole.mutate({ id: ur.id, showroomId: v === "none" ? null : v })}
                      >
                        <SelectTrigger className="w-[150px]"><SelectValue placeholder="Showroom" /></SelectTrigger>
                        <SelectContent className="bg-popover">
                          <SelectItem value="none">No Showroom</SelectItem>
                          {showrooms.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Admin;
