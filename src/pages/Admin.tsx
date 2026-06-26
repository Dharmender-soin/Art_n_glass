import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Shield, MapPin, Users, UserPlus, Eye, EyeOff, Key, Trash2, Building, Plus, Search, Tag, Power, PowerOff, Pencil, Car, Send } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { SendNotificationForm } from "@/components/dashboard/SendNotificationForm";
import { ScheduledNotificationsPanel } from "@/components/dashboard/ScheduledNotificationsPanel";

type AppRole = Database["public"]["Enums"]["app_role"];
type VisitWithType = Database["public"]["Enums"]["visit_with_type"];


const Admin = () => {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [createShowroomOpen, setCreateShowroomOpen] = useState(false);
  const [newShowroom, setNewShowroom] = useState({ name: "", city: "" });

  const [searchQuery, setSearchQuery] = useState("");
  const [createPurposeOpen, setCreatePurposeOpen] = useState(false);
  const [newPurpose, setNewPurpose] = useState({ purpose_name: "", entity_type: "client" as VisitWithType });
  const [createConveyanceOpen, setCreateConveyanceOpen] = useState(false);
  const [newConveyance, setNewConveyance] = useState({ vehicle_type: "", rate_per_km: "" });
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editProfileUser, setEditProfileUser] = useState<any>(null);
  const [editProfileForm, setEditProfileForm] = useState({ full_name: "", phone: "", conveyance_type: "", conveyance_rate: "" });
  const [showResetPwd, setShowResetPwd] = useState(false);
  // Alert dialog state
  const [alertDialog, setAlertDialog] = useState<{ open: boolean; title: string; description: string; onConfirm: () => void; }>({ open: false, title: "", description: "", onConfirm: () => {} });
  const openAlert = (title: string, description: string, onConfirm: () => void) => setAlertDialog({ open: true, title, description, onConfirm });
  const closeAlert = () => setAlertDialog(prev => ({ ...prev, open: false }));




  const [newUser, setNewUser] = useState({
    email: "", password: "", full_name: "", role: "executive" as AppRole, showroom_id: "",
  });

  // Fetch Showrooms
  const { data: showrooms = [] } = useQuery({
    queryKey: ["showrooms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("showrooms").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Mutation: Create Showroom
  const createShowroom = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("showrooms").insert([newShowroom]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showrooms"] });
      toast.success("Showroom created successfully!");
      setNewShowroom({ name: "", city: "" });
      setCreateShowroomOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Mutation: Delete Showroom
  const deleteShowroom = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("showrooms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["showrooms"] });
      toast.success("Showroom deleted!");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  // Fetch Purposes
  const { data: purposes = [] } = useQuery({
    queryKey: ["purpose-masters"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purpose_masters").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createPurpose = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("purpose_masters").insert([newPurpose]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purpose-masters"] });
      toast.success("Purpose added!");
      setNewPurpose({ purpose_name: "", entity_type: "client" });
      setCreatePurposeOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePurpose = useMutation({
    mutationFn: async ({ id, is_active }: { id: string, is_active: boolean }) => {
      const { error } = await supabase.from("purpose_masters").update({ is_active: !is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purpose-masters"] });
      toast.success("Purpose status toggled!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePurpose = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purpose_masters").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purpose-masters"] });
      toast.success("Purpose deleted!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Fetch Conveyance Settings
  const { data: conveyanceSettings = [] } = useQuery({
    queryKey: ["conveyance-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("conveyance_settings").select("*").order("vehicle_type");
      if (error && error.code !== '42P01') throw error; // Ignore table not found if migration holds
      return data || [];
    },
  });

  const createConveyance = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("conveyance_settings").insert([{ 
        vehicle_type: newConveyance.vehicle_type.toLowerCase(), 
        rate_per_km: Number(newConveyance.rate_per_km) 
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conveyance-settings"] });
      toast.success("Conveyance rate added!");
      setNewConveyance({ vehicle_type: "", rate_per_km: "" });
      setCreateConveyanceOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteConveyance = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("conveyance_settings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conveyance-settings"] });
      toast.success("Conveyance rate deleted!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Fetch Users & Roles
  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ["all-users-details"],
    queryFn: async () => {
      // 1. Get auth users via Edge Function (Best effort)
      let authUsers: any[] = [];
      try {
        const { data: authData, error: authError } = await supabase.functions.invoke("manage-users", {
          body: { action: "list_users" }
        });
        if (!authError && authData?.users) {
          authUsers = authData.users;
        }
      } catch (e) {
        console.warn("Manage users function unavailable:", e);
      }

      // 2. Get roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");
      if (rolesError) throw rolesError;

      // 3. Get profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*");
      if (profilesError) throw profilesError;

      // Merge data - iterate over roles to ensure we show all users even if auth fetch fails
      return roles.map((r) => {
        const authUser = authUsers.find((u: any) => u.id === r.user_id);
        const userProfile = profiles.find((p) => p.user_id === r.user_id);

        // Use profile email (from new migration) or auth email, or fallback
        const email = (userProfile as any)?.email || authUser?.email || "Email hidden (Backend pending)";

        return {
          id: r.user_id,
          email: email,
          full_name: userProfile?.full_name || authUser?.user_metadata?.full_name || "Unknown",
          phone: userProfile?.phone,
          role: r.role || "executive",
          showroom_id: r.showroom_id,
          reports_to: (r as any).reports_to ?? null,
          created_at: r.created_at,
          role_id: r.id,
          is_active: (r as any).is_active !== false, // default true if column not yet migrated
        };
      }).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    enabled: role === "admin",
  });

  // Mutation: Update Role/Showroom/ReportsTo
  const updateUserRole = useMutation({
    mutationFn: async ({ id, roleId, newRole, showroomId, reportsTo }: {
      id: string;
      roleId?: string;
      newRole?: AppRole;
      showroomId?: string | null;
      reportsTo?: string | null;
    }) => {
      const updateData: Record<string, unknown> = {};

      if (newRole) updateData.role = newRole;
      if (showroomId !== undefined) updateData.showroom_id = showroomId || null;
      if (reportsTo !== undefined) updateData.reports_to = reportsTo || null;

      if (!roleId) {
        const { error } = await supabase.from("user_roles").upsert({
          user_id: id,
          role: newRole || "executive",
          showroom_id: showroomId || null,
          reports_to: reportsTo || null,
        }, { onConflict: "user_id" });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").update(updateData).eq("id", roleId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-users-details"] });
      toast.success("User updated!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Mutation: Create User
  const createUser = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke("create-user", {
        body: {
          email: newUser.email,
          password: newUser.password,
          full_name: newUser.full_name,
          role: newUser.role,
          showroom_id: newUser.showroom_id || null,
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-users-details"] });
      queryClient.invalidateQueries({ queryKey: ["showrooms"] });
      toast.success("User created successfully!");
      setNewUser({ email: "", password: "", full_name: "", role: "executive", showroom_id: "" });
      setCreateUserOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Mutation: Reset Password
  const resetPassword = useMutation({
    mutationFn: async () => {
      if (!selectedUser || !newPassword) return;

      const res = await supabase.functions.invoke("manage-users", {
        body: {
          action: "reset_password",
          userId: selectedUser.id,
          newPassword: newPassword
        }
      });

      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      toast.success("Password updated successfully!");
      setResetPasswordOpen(false);
      setNewPassword("");
      setSelectedUser(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Mutation: Delete User
  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const res = await supabase.functions.invoke("manage-users", {
        body: {
          action: "delete_user",
          userId: userId,
        },
      });
      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-users-details"] });
      toast.success("User deleted successfully!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Mutation: Toggle Employee Active/Inactive
  const toggleUserActive = useMutation({
    mutationFn: async ({ roleId, is_active }: { roleId: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("user_roles")
        .update({ is_active: !is_active } as any)
        .eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-users-details"] });
      queryClient.invalidateQueries({ queryKey: ["md-roles"] });
      toast.success("Employee status updated!");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  // Mutation: Update Profile (name, phone, conveyance)
  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!editProfileUser) return;
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: editProfileForm.full_name,
          phone: editProfileForm.phone || null,
          conveyance_type: editProfileForm.conveyance_type || null,
          conveyance_rate: editProfileForm.conveyance_rate ? Number(editProfileForm.conveyance_rate) : null,
        })
        .eq("user_id", editProfileUser.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-users-details"] });
      toast.success("Profile updated successfully!");
      setEditProfileOpen(false);
      setEditProfileUser(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Filter Users
  const filteredUsers = users.filter((u: any) =>
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (role !== "admin") {
    return <p className="text-center text-muted-foreground py-8">Access denied. Admins only.</p>;
  }

  const roleColor: Record<string, string> = {
    md: "bg-primary text-primary-foreground",
    admin: "bg-primary text-primary-foreground",
    manager: "bg-[hsl(var(--status-hot))] text-white",
    tl: "bg-indigo-600 text-white",
    executive: "bg-[hsl(var(--status-new))] text-white",
    accountant: "bg-teal-600 text-white",
    backhand_executive: "bg-slate-600 text-white",
  };

  return (
    <>
      <div className="space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            User Management
          </h1>
          <p className="text-muted-foreground mt-1">Manage roles, showrooms & user accounts</p>
        </div>
      </div>

      {/* Showrooms Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Building className="h-5 w-5" /> Showrooms
          </h2>
          <Dialog open={createShowroomOpen} onOpenChange={setCreateShowroomOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" /> Add Showroom</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add New Showroom</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createShowroom.mutate(); }} className="space-y-3">
                <div className="space-y-1"><Label>Name</Label><Input value={newShowroom.name} onChange={(e) => setNewShowroom({ ...newShowroom, name: e.target.value })} required placeholder="e.g. Kirti Nagar" /></div>
                <div className="space-y-1"><Label>City</Label><Input value={newShowroom.city} onChange={(e) => setNewShowroom({ ...newShowroom, city: e.target.value })} required placeholder="e.g. Delhi" /></div>
                <Button type="submit" className="w-full" disabled={createShowroom.isPending}>Create</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          {showrooms.map((s) => {
            const count = users.filter((u: any) => u.showroom_id === s.id).length;
            return (
              <Card key={s.id} className="relative group overflow-hidden transition-all hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-lg">{s.name}</p>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {s.city}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-primary">{count}</p>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Users</p>
                    </div>
                  </div>
                </CardContent>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => openAlert(
                    "Delete Showroom",
                    `Are you sure you want to delete "${s.name}"? This cannot be undone.`,
                    () => deleteShowroom.mutate(s.id)
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </Card>
            );
          })}
        </div>
      </section>

      <div className="border-t my-8" />


      {/* Master Data: Purposes */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Tag className="h-5 w-5" /> Visit Purposes
          </h2>
          <Dialog open={createPurposeOpen} onOpenChange={setCreatePurposeOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" /> Add Purpose</Button>
            </DialogTrigger>
            <DialogContent className="bg-popover">
              <DialogHeader><DialogTitle>Add New Purpose</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createPurpose.mutate(); }} className="space-y-3">
                <div className="space-y-1"><Label>Purpose Name</Label><Input value={newPurpose.purpose_name} onChange={(e) => setNewPurpose({ ...newPurpose, purpose_name: e.target.value })} required placeholder="e.g. Follow-up meeting" /></div>
                <div className="space-y-1">
                  <Label>Entity Type</Label>
                  <Select value={newPurpose.entity_type} onValueChange={(v: any) => setNewPurpose({ ...newPurpose, entity_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="partner">Partner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={createPurpose.isPending}>Create</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {purposes.map((p) => (
            <Card key={p.id} className={`relative group overflow-hidden transition-all shadow-sm border ${p.is_active ? 'border-primary/20' : 'opacity-70 border-border'}`}>
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-base">{p.purpose_name}</p>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">Type: {p.entity_type}</p>
                  </div>
                  <div className="flex gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className={`h-7 w-7 ${p.is_active ? 'text-orange-500 hover:bg-orange-500/10' : 'text-green-500 hover:bg-green-500/10'}`} onClick={() => togglePurpose.mutate({ id: p.id, is_active: p.is_active || false })} title={p.is_active ? 'Deactivate' : 'Activate'}>
                        {p.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => openAlert("Delete Purpose", `Delete "${p.purpose_name}"? This cannot be undone.`, () => deletePurpose.mutate(p.id))}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {purposes.length === 0 && <p className="text-muted-foreground text-sm">No purposes defined. Add one to get started.</p>}
        </div>
      </section>

      <div className="border-t my-8" />

      {/* Master Data: Conveyance Settings */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Car className="h-5 w-5" /> Conveyance Rates
          </h2>
          <Dialog open={createConveyanceOpen} onOpenChange={setCreateConveyanceOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" /> Add Rate</Button>
            </DialogTrigger>
            <DialogContent className="bg-popover">
              <DialogHeader><DialogTitle>Add Conveyance Rate</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createConveyance.mutate(); }} className="space-y-3">
                <div className="space-y-1"><Label>Vehicle Type</Label><Input value={newConveyance.vehicle_type} onChange={(e) => setNewConveyance({ ...newConveyance, vehicle_type: e.target.value })} required placeholder="e.g. car, bike, bus" /></div>
                <div className="space-y-1"><Label>Rate per KM (₹)</Label><Input type="number" step="0.5" value={newConveyance.rate_per_km} onChange={(e) => setNewConveyance({ ...newConveyance, rate_per_km: e.target.value })} required placeholder="e.g. 8" /></div>
                <Button type="submit" className="w-full" disabled={createConveyance.isPending}>Create</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {conveyanceSettings.map((c) => (
            <Card key={c.id} className="relative group overflow-hidden transition-all shadow-sm border border-primary/20">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-base capitalize">{c.vehicle_type}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">₹{c.rate_per_km} / km</p>
                  </div>
                  <div className="flex gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => openAlert("Delete Rate", `Are you sure you want to delete the rate for "${c.vehicle_type}"?`, () => deleteConveyance.mutate(c.id))}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {conveyanceSettings.length === 0 && <p className="text-muted-foreground text-sm">No conveyance rates defined.</p>}
        </div>
      </section>

      <div className="border-t my-8" />

      {/* Users Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold flex items-center gap-2 min-w-fit">
              <Users className="h-5 w-5" /> Users ({users.length})
            </h2>
            <div className="relative w-full sm:w-[300px]">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground" />
              </div>
              <Input
                type="text"
                placeholder="Search by name or email..."
                className="pl-9 h-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="shadow-sm"><UserPlus className="mr-1 h-4 w-4" />Create User</Button>
            </DialogTrigger>
            <DialogContent className="bg-popover sm:max-w-[425px]">
              <DialogHeader><DialogTitle>Create New User</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); createUser.mutate(); }} className="space-y-4">
                <div className="space-y-1.5"><Label>Full Name</Label><Input value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} required /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required /></div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <div className="relative">
                    <Input type={showPassword ? "text" : "password"} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required minLength={6} />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v as AppRole })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover">
                        <SelectItem value="md">MD</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="manager">Manager / GM</SelectItem>
                        <SelectItem value="tl">Team Leader (TL)</SelectItem>
                        <SelectItem value="executive">Executive</SelectItem>
                        <SelectItem value="accountant">Accountant</SelectItem>
                        <SelectItem value="backhand_executive">Backhand Executive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Showroom</Label>
                    <Select value={newUser.showroom_id} onValueChange={(v) => setNewUser({ ...newUser, showroom_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Showroom..." /></SelectTrigger>
                      <SelectContent className="bg-popover">
                        <SelectItem value="none">No Showroom</SelectItem>
                        {showrooms.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full mt-2" disabled={createUser.isPending}>
                  {createUser.isPending ? "Creating..." : "Create User"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="overflow-hidden border shadow-sm">
          <CardContent className="p-0">
            {filteredUsers.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center text-muted-foreground">
                <Users className="h-10 w-10 mb-3 opacity-20" />
                <p>No users found matching "{searchQuery}".</p>
                {users.length === 0 && !isLoadingUsers && <p className="text-sm">Get started by creating a new user.</p>}
              </div>
            ) : (
              <div className="divide-y">
                {filteredUsers.map((u: any, index: number) => {
                  const showroom = showrooms.find((s) => s.id === u.showroom_id);
                  return (
                    <motion.div
                      key={u.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05, duration: 0.3 }}
                      className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/30 transition-colors ${
                        !u.is_active ? "opacity-50 bg-muted/20" : ""
                      }`}
                    >
                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium text-base ${!u.is_active ? "line-through text-muted-foreground" : ""}`}>{u.full_name}</span>
                          <Badge className={`${roleColor[u.role] || ""} text-[10px] border-0 capitalize px-2 py-0.5 h-5 shadow-none`}>{u.role}</Badge>
                          {!u.is_active && (
                            <Badge variant="outline" className="text-[10px] px-2 py-0.5 h-5 text-orange-500 border-orange-400">Inactive</Badge>
                          )}
                          {showroom && (
                            <Badge variant="outline" className="text-[10px] px-2 py-0.5 h-5 font-normal text-muted-foreground">
                              <MapPin className="h-3 w-3 mr-1" />{showroom.name}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                            {u.email}
                          </span>
                          {u.phone && <span className="border-l pl-4 border-border/50 hidden sm:flex sm:items-center sm:gap-1">{u.phone}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Select
                          value={u.role}
                          onValueChange={(v) => updateUserRole.mutate({ id: u.id, roleId: u.role_id, newRole: v as AppRole })}
                        >
                          <SelectTrigger className="w-[110px] h-8 text-xs bg-background/50"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-popover">
                            <SelectItem value="md">MD</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="manager">Manager / GM</SelectItem>
                            <SelectItem value="tl">Team Leader (TL)</SelectItem>
                            <SelectItem value="executive">Executive</SelectItem>
                            <SelectItem value="accountant">Accountant</SelectItem>
                            <SelectItem value="backhand_executive">Backhand Executive</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select
                          value={u.showroom_id || "none"}
                          onValueChange={(v) => updateUserRole.mutate({ id: u.id, roleId: u.role_id, showroomId: v === "none" ? null : v })}
                        >
                          <SelectTrigger className="w-[130px] h-8 text-xs bg-background/50"><SelectValue placeholder="Showroom" /></SelectTrigger>
                          <SelectContent className="bg-popover">
                            <SelectItem value="none">No Showroom</SelectItem>
                            {showrooms.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Reports To — only for executive (pick TL) or tl (pick Manager) */}
                        {(u.role === "executive" || u.role === "tl") && (() => {
                          const supervisorRole = u.role === "executive" ? "tl" : "manager";
                          const supervisors = (users as any[]).filter(
                            (su) => su.role === supervisorRole && su.showroom_id === u.showroom_id
                          );
                          if (supervisors.length === 0) return null;
                          return (
                            <Select
                              value={u.reports_to || "none"}
                              onValueChange={(v) =>
                                updateUserRole.mutate({
                                  id: u.id,
                                  roleId: u.role_id,
                                  reportsTo: v === "none" ? null : v,
                                })
                              }
                            >
                              <SelectTrigger className="w-[140px] h-8 text-xs bg-indigo-500/10 border-indigo-500/30 text-indigo-400">
                                <SelectValue placeholder={u.role === "executive" ? "Assign TL…" : "Assign Manager…"} />
                              </SelectTrigger>
                              <SelectContent className="bg-popover">
                                <SelectItem value="none">
                                  {u.role === "executive" ? "No TL assigned" : "No Manager assigned"}
                                </SelectItem>
                                {supervisors.map((su: any) => (
                                  <SelectItem key={su.id} value={su.id}>
                                    {su.full_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          );
                        })()}

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          title="Reset Password"
                          onClick={() => { setSelectedUser(u); setResetPasswordOpen(true); }}
                        >
                          <Key className="h-4 w-4" />
                        </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-blue-500"
                            title="Edit Profile"
                            onClick={() => {
                              setEditProfileUser(u);
                              setEditProfileForm({
                                full_name: u.full_name || "",
                                phone: u.phone || "",
                                conveyance_type: u.conveyance_type || "",
                                conveyance_rate: u.conveyance_rate ? String(u.conveyance_rate) : "",
                              });
                              setEditProfileOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-8 w-8 p-0 ${
                            u.is_active
                              ? "text-orange-500 hover:bg-orange-500/10 hover:text-orange-600"
                              : "text-green-500 hover:bg-green-500/10 hover:text-green-600"
                          }`}
                          title={u.is_active ? "Deactivate Employee" : "Activate Employee"}
                          onClick={() => openAlert(
                            u.is_active ? "Deactivate Employee" : "Activate Employee",
                            u.is_active
                              ? `${u.full_name} ko deactivate karo? Ye Command Centre aur leaderboard se hide ho jaayega.`
                              : `${u.full_name} ko wapas activate karo?`,
                            () => toggleUserActive.mutate({ roleId: u.role_id, is_active: u.is_active })
                          )}
                        >
                          {u.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          title="Delete User"
                          onClick={() => openAlert(
                            "Delete User",
                            `Delete ${u.full_name}? This action cannot be undone and will remove all their data.`,
                            () => deleteUser.mutate(u.id)
                          )}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <div className="border-t my-8" />

      {/* Push Notifications Section */}
      <section className="space-y-6">
        <SendNotificationForm />
        <div className="border-t border-border/40 my-6" />
        <ScheduledNotificationsPanel />
      </section>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <CardDescription>Changing password for <b>{selectedUser?.full_name}</b></CardDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="relative">
                <Input
                  type={showResetPwd ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  minLength={6}
                />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowResetPwd(v => !v)}>
                  {showResetPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Must be at least 6 characters.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordOpen(false)}>Cancel</Button>
            <Button onClick={() => resetPassword.mutate()} disabled={resetPassword.isPending || newPassword.length < 6}>
              {resetPassword.isPending ? "Updating..." : "Update Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={editProfileOpen} onOpenChange={(open) => { setEditProfileOpen(open); if (!open) setEditProfileUser(null); }}>
        <DialogContent className="bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Employee Profile</DialogTitle>
            <CardDescription>Editing profile for <b>{editProfileUser?.full_name}</b></CardDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); updateProfile.mutate(); }} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input value={editProfileForm.full_name} onChange={(e) => setEditProfileForm({ ...editProfileForm, full_name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={editProfileForm.phone} onChange={(e) => setEditProfileForm({ ...editProfileForm, phone: e.target.value })} placeholder="+91 XXXXX XXXXX" />
            </div>
            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-3">Conveyance Settings</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Vehicle Type</Label>
                  <Select value={editProfileForm.conveyance_type || "none"} onValueChange={(v) => {
                    const newRate = conveyanceSettings.find(s => s.vehicle_type === v)?.rate_per_km;
                    setEditProfileForm({ 
                      ...editProfileForm, 
                      conveyance_type: v === "none" ? "" : v, 
                      conveyance_rate: newRate !== undefined ? String(newRate) : editProfileForm.conveyance_rate 
                    });
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="none">No Vehicle</SelectItem>
                      {conveyanceSettings.map(c => (
                        <SelectItem key={c.vehicle_type} value={c.vehicle_type}>
                          {c.vehicle_type} (₹{c.rate_per_km}/km)
                        </SelectItem>
                      ))}
                      {/* Fallback items if array empty (temporary until migration) */}
                      {conveyanceSettings.length === 0 && (
                        <>
                          <SelectItem value="car">Car (₹8/km default)</SelectItem>
                          <SelectItem value="bike">Bike (₹4/km default)</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Rate (₹ per km)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editProfileForm.conveyance_rate}
                    onChange={(e) => setEditProfileForm({ ...editProfileForm, conveyance_rate: e.target.value })}
                    placeholder="e.g. 8"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Selecting a vehicle auto-fills the default rate. You can override it.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditProfileOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>

      {/* Global Alert Dialog */}
      <AlertDialog open={alertDialog.open} onOpenChange={(open) => !open && closeAlert()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{alertDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{alertDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { alertDialog.onConfirm(); closeAlert(); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Admin;
