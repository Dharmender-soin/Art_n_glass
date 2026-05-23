import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { User, Car, LogOut, Camera, Loader2 } from "lucide-react";

const Profile = () => {
  const { user, role, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [conveyanceType, setConveyanceType] = useState("");
  const [conveyanceRate, setConveyanceRate] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const { data: conveyanceSettings = [] } = useQuery({
    queryKey: ["conveyance-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("conveyance_settings").select("*").order("vehicle_type");
      if (error && error.code !== '42P01') throw error;
      return data || [];
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPhone(profile.phone || "");
      setConveyanceType((profile as any).conveyance_type || "");
      setConveyanceRate((profile as any).conveyance_rate?.toString() || "");
      setAvatarUrl((profile as any).avatar_url || null);
    }
  }, [profile]);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setIsUploadingAvatar(true);
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error("You must select an image to upload.");
      }
      const file = event.target.files[0];
      const fileExt = file.name.split(".").pop();
      const filePath = `${user!.id}-${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);

      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: urlData.publicUrl }).eq("user_id", user!.id);
      if (updateError) throw updateError;

      setAvatarUrl(urlData.publicUrl);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      toast.success("Avatar updated successfully!");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const updateProfile = useMutation({
    mutationFn: async () => {
      const updateData: any = { full_name: fullName, phone };
      if (conveyanceType && conveyanceType !== "none") {
        updateData.conveyance_type = conveyanceType;
        updateData.conveyance_rate = conveyanceRate ? parseFloat(conveyanceRate) : null;
      } else {
        updateData.conveyance_type = null;
        updateData.conveyance_rate = null;
      }
      const { error } = await supabase.from("profiles").update(updateData).eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile updated!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Default rates — applied every time the vehicle type changes
  const DEFAULT_RATES: Record<string, string> = { bike: "4", car: "8" };

  const handleVehicleChange = (v: string) => {
    setConveyanceType(v === "none" ? "" : v);
    if (v === "none") {
      setConveyanceRate("");
      return;
    }
    // Prefer admin-configured rate from conveyance_settings, else use system default
    const setting = conveyanceSettings.find(s => s.vehicle_type === v);
    if (setting) {
      setConveyanceRate(setting.rate_per_km.toString());
    } else {
      setConveyanceRate(DEFAULT_RATES[v] ?? "");
    }
  };

  type WalletPeriod = "this_month" | "last_30" | "this_week" | "today";
  const [walletPeriod, setWalletPeriod] = useState<WalletPeriod>("this_month");

  const walletDateRange = (() => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    if (walletPeriod === "today") return { from: fmt(today), to: fmt(today) };
    if (walletPeriod === "this_week") {
      const day = today.getDay();
      const mon = new Date(today); mon.setDate(today.getDate() - ((day + 6) % 7));
      return { from: fmt(mon), to: fmt(today) };
    }
    if (walletPeriod === "last_30") {
      const d = new Date(today); d.setDate(today.getDate() - 29);
      return { from: fmt(d), to: fmt(today) };
    }
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last  = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { from: fmt(first), to: fmt(last) };
  })();

  const { data: walletRecords = [], isLoading: walletLoading } = useQuery({
    queryKey: ["profile-wallet", user?.id, walletDateRange.from, walletDateRange.to],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conveyance_records")
        .select("*")
        .eq("user_id", user!.id)
        .gte("date", walletDateRange.from)
        .lte("date", walletDateRange.to)
        .order("date", { ascending: false })
        .order("created_at", { ascending: true });
      if (error && error.code !== "42P01") throw error;
      return data || [];
    },
  });

  const walletTotalKm     = walletRecords.reduce((s, r) => s + (r.distance_km || 0), 0);
  const walletTotalAmount = walletRecords.reduce((s, r) => s + (r.amount || 0), 0);

  const walletByDate = walletRecords.reduce<Record<string, typeof walletRecords>>((acc, r) => {
    if (!acc[r.date]) acc[r.date] = [];
    acc[r.date].push(r);
    return acc;
  }, {});

  const vehicleEmoji = (v: string) => {
    const t = (v || "").toLowerCase();
    if (t.includes("car")) return "🚗";
    if (t.includes("bike") || t.includes("motor")) return "🏍️";
    return "🚌";
  };

  const periodLabel: Record<WalletPeriod, string> = {
    this_month: "This Month",
    last_30: "Last 30 Days",
    this_week: "This Week",
    today: "Today",
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <User className="h-6 w-6" /> Profile
      </h1>

      <Card>
        <CardHeader><CardTitle className="text-lg">Your Information</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col items-center mb-6">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-primary/20">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="h-12 w-12 text-muted-foreground opacity-50" />
                )}
              </div>
              <Label htmlFor="avatar-upload" className="absolute bottom-0 right-0 bg-primary text-primary-foreground p-2 rounded-full cursor-pointer hover:bg-primary/90 transition shadow-md">
                {isUploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </Label>
              <Input
                id="avatar-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={isUploadingAvatar}
              />
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); updateProfile.mutate(); }} className="space-y-4">
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled className="bg-muted/30" />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <div><Badge className="capitalize">{role || "executive"}</Badge></div>
            </div>

            <Separator />

            <div className="space-y-1">
              <Label>Full Name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 XXXXX XXXXX" />
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Car className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Conveyance Settings</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Vehicle Type</Label>
                  <Select value={conveyanceType || "none"} onValueChange={handleVehicleChange}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="none">No Vehicle</SelectItem>
                      {conveyanceSettings.map(c => (
                        <SelectItem key={c.vehicle_type} value={c.vehicle_type}>
                          <span className="capitalize">{c.vehicle_type}</span>
                        </SelectItem>
                      ))}
                      {conveyanceSettings.length === 0 && (
                        <>
                          <SelectItem value="car">🚗 Car</SelectItem>
                          <SelectItem value="bike">🏍 Bike</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label>Rate (₹/km)</Label>
                    <div className="flex items-center gap-1">
                      <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">🏍 ₹4</span>
                      <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold bg-orange-500/10 text-orange-500 border border-orange-500/20">🚗 ₹8</span>
                    </div>
                  </div>
                  <Input
                    type="number"
                    value={conveyanceRate}
                    placeholder="Select vehicle"
                    readOnly
                    className="bg-muted/40 cursor-not-allowed select-none pointer-events-none"
                  />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border border-border">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <span className="font-bold text-base">Conveyance Wallet</span>
          </div>
          <Select value={walletPeriod} onValueChange={(v) => setWalletPeriod(v as WalletPeriod)}>
            <SelectTrigger className="h-7 text-xs w-[120px] bg-background border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_30">Last 30 Days</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="today">Today</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mx-4 mb-3 rounded-xl bg-emerald-600 text-white overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-white/20">
            <div className="px-4 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">Total Distance</p>
              <p className="text-2xl font-bold font-mono mt-0.5">
                {walletLoading ? "…" : walletTotalKm.toFixed(1)}
                <span className="text-sm font-semibold ml-1 text-white/80">km</span>
              </p>
            </div>
            <div className="px-4 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">Est. Earnings</p>
              <p className="text-2xl font-bold font-mono mt-0.5">
                {walletLoading ? "…" : `₹${walletTotalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
              </p>
            </div>
          </div>
          <div className="px-4 py-2 border-t border-white/20 flex items-center justify-between">
            <span className="text-[11px] text-white/70">
              {walletRecords.length} trip{walletRecords.length !== 1 ? "s" : ""} recorded
            </span>
            <span className="text-[11px] text-white/70">{periodLabel[walletPeriod]}</span>
          </div>
        </div>

        <CardContent className="px-4 pb-4 space-y-3">
          {walletLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg animate-pulse bg-muted/40" />)}
            </div>
          ) : walletRecords.length === 0 ? (
            <div className="py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mx-auto mb-3">
                <Car className="h-5 w-5 text-muted-foreground/40" />
              </div>
              <p className="text-sm font-semibold text-muted-foreground">No travel records found</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{periodLabel[walletPeriod]}</p>
            </div>
          ) : (
            Object.entries(walletByDate)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([date, trips]) => {
                const dayKm  = trips.reduce((s, r) => s + (r.distance_km || 0), 0);
                const dayAmt = trips.reduce((s, r) => s + (r.amount || 0), 0);
                const d = new Date(date);
                const dateLabel = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
                const dayName  = d.toLocaleDateString("en-IN", { weekday: "short" });

                return (
                  <div key={date} className="rounded-xl border border-border overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex flex-col items-center justify-center">
                          <span className="text-[9px] font-bold text-primary/60 uppercase leading-none">{dayName}</span>
                          <span className="text-[13px] font-bold text-primary leading-none">{d.getDate()}</span>
                        </div>
                        <div>
                          <p className="text-xs font-bold">{dateLabel}</p>
                          <p className="text-[10px] text-muted-foreground">{trips.length} trip{trips.length !== 1 ? "s" : ""}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-mono font-bold text-emerald-600">{dayKm.toFixed(1)} km</p>
                        <p className="text-sm font-mono font-bold text-emerald-500">₹{dayAmt.toFixed(0)}</p>
                      </div>
                    </div>

                    <div className="divide-y divide-border/40">
                      {trips.map((trip) => (
                        <div key={trip.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/10 transition-colors">
                          <span className="text-lg shrink-0">{vehicleEmoji(trip.vehicle_type)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 text-xs font-semibold">
                              <span className="truncate max-w-[90px] text-foreground">
                                {trip.from_location_name || "Start"}
                              </span>
                              <span className="text-muted-foreground shrink-0">→</span>
                              <span className="truncate max-w-[90px] text-foreground">
                                {trip.to_location_name || (trip.visit_id ? "Visit" : "End Day")}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground capitalize mt-0.5">
                              {trip.vehicle_type} · ₹{trip.rate_per_km}/km
                              <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${trip.visit_id ? "bg-blue-500/10 text-blue-500" : "bg-orange-500/10 text-orange-500"}`}>
                                {trip.visit_id ? "Visit" : "Return"}
                              </span>
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-mono font-semibold">{(trip.distance_km || 0).toFixed(1)} km</p>
                            <p className="text-sm font-mono font-bold text-emerald-500">₹{(trip.amount || 0).toFixed(0)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
          )}
        </CardContent>
      </Card>

      <Button variant="outline" className="w-full flex items-center gap-2" onClick={signOut}>
        <LogOut className="h-4 w-4" /> Sign Out
      </Button>
    </div>
  );
};

export default Profile;
