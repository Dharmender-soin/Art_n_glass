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
      // Always apply the default — even overrides an existing rate
      setConveyanceRate(DEFAULT_RATES[v] ?? "");
    }
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
            {/* Email & Role — read-only */}
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled className="bg-muted/30" />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <div><Badge className="capitalize">{role || "executive"}</Badge></div>
            </div>

            <Separator />

            {/* Editable fields */}
            <div className="space-y-1">
              <Label>Full Name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 XXXXX XXXXX" />
            </div>

            <Separator />

            {/* Conveyance Settings */}
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
                    {/* Default-rate hint badges */}
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
              <p className="text-xs text-muted-foreground mt-2">
                Default: 🏍 Bike = ₹4/km · 🚗 Car = ₹8/km. You can override this value.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Button variant="outline" className="w-full flex items-center gap-2" onClick={signOut}>
        <LogOut className="h-4 w-4" /> Sign Out
      </Button>
    </div>
  );
};

export default Profile;
