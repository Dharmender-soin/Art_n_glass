import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Smartphone } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type Slot = 1 | 2;
function readSlot(value: unknown): Slot {
  if (value !== 1 && value !== 2) throw new Error("The saved WhatsApp number could not be read. Please retry.");
  return value;
}

export function WhatsHubSenderSettings() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["whatshub-sender-slot", user?.id];
  const [draftSlot, setDraftSlot] = useState<Slot | null>(null);
  const { data: savedSlot, error, isLoading, refetch } = useQuery({
    queryKey,
    enabled: role === "admin",
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_whatshub_sender_slot");
      if (error) throw new Error(error.message);
      return readSlot(data);
    },
  });
  const save = useMutation({
    mutationFn: async (slot: Slot) => {
      const { data, error } = await (supabase.rpc as any)("set_whatshub_sender_slot", { p_slot: slot });
      if (error) throw new Error(error.message);
      const saved = readSlot(data);
      if (saved !== slot) throw new Error("The selected WhatsApp number was not saved. Please retry.");
      return saved;
    },
    onSuccess: (slot) => {
      queryClient.setQueryData(queryKey, slot);
      setDraftSlot(null);
    },
  });
  if (role !== "admin") return null;
  const selectedSlot = draftSlot ?? savedSlot;

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Smartphone className="h-5 w-5 text-emerald-600" /> WhatsApp Sending Number</CardTitle>
        <CardDescription>Select the connected number shown in WhatsHub. This saved choice applies to test messages, showroom messages and scheduled reports.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="whatshub-sender-slot">Send using</Label>
            <select id="whatshub-sender-slot" value={selectedSlot ?? ""} disabled={isLoading || save.isPending}
              onChange={(event) => { setDraftSlot(Number(event.target.value) as Slot); save.reset(); }}
              className="h-10 w-full rounded-xl border bg-background px-3 text-sm">
              <option value="" disabled>{isLoading ? "Loading saved number…" : "Select a number"}</option>
              <option value="1">Number 1 (Slot 1)</option>
              <option value="2">Number 2 (Slot 2)</option>
            </select>
          </div>
          <Button type="button" disabled={!selectedSlot || isLoading || save.isPending || selectedSlot === savedSlot}
            onClick={() => selectedSlot && save.mutate(selectedSlot)}>
            {save.isPending ? "Saving…" : "Save Sending Number"}
          </Button>
        </div>
        {savedSlot && <p className="text-xs text-muted-foreground">Currently saved: Number {savedSlot}. The number must be connected in WhatsHub.</p>}
        {draftSlot && draftSlot !== savedSlot && <p className="text-xs text-amber-600">Save Number {draftSlot} before sending. Changing this selection alone does not change the sender.</p>}
        {error && !save.isSuccess && <div className="text-xs text-destructive"><p role="alert">Could not load the sending number: {error.message}</p><Button type="button" size="sm" variant="outline" onClick={() => void refetch()} className="mt-2">Retry Sending Number</Button></div>}
        {save.error && <p role="alert" className="text-xs text-destructive">Sending number was not saved: {save.error.message}</p>}
        {save.isSuccess && <p role="status" className="text-xs text-emerald-600">Number {save.data} saved. New messages will use this number.</p>}
      </CardContent>
    </Card>
  );
}
