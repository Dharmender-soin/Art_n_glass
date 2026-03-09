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
import { User, Car, LogOut } from "lucide-react";

const Profile = () => {
  const { user, role, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [conveyanceType, setConveyanceType] = useState("");
  const [conveyanceRate, setConveyanceRate] = useState("");

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
    }
  }, [profile]);

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

  const handleVehicleChange = (v: string) => {
    setConveyanceType(v === "none" ? "" : v);
    if (v === "car" && !conveyanceRate) setConveyanceRate("8");
    else if (v === "bike" && !conveyanceRate) setConveyanceRate("4");
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <User className="h-6 w-6" /> Profile
      </h1>

      <Card>
        <CardHeader><CardTitle className="text-lg">Your Information</CardTitle></CardHeader>
        <CardContent>
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
                      <SelectItem value="car">🚗 Car</SelectItem>
                      <SelectItem value="bike">🏍 Bike</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Rate (₹/km)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={conveyanceRate}
                    onChange={(e) => setConveyanceRate(e.target.value)}
                    placeholder="e.g. 8"
                    disabled={!conveyanceType || conveyanceType === "none"}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                These values are used to calculate your conveyance expenses automatically.
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
