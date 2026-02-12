import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const WorkScopeSection = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [workTypeId, setWorkTypeId] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");

  const { data: masterTypes = [] } = useQuery({
    queryKey: ["master-work-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("master_work_types").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["work-scope", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_scope_items").select("*, master_work_types(type_of_work, sub_work)").eq("client_id", clientId);
      if (error) throw error;
      return data;
    },
  });

  const addItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("work_scope_items").insert({
        client_id: clientId,
        work_type_id: workTypeId,
        description: description || null,
        quantity: quantity ? parseInt(quantity) : null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-scope", clientId] });
      queryClient.invalidateQueries({ queryKey: ["work-scope-counts"] });
      toast.success("Work scope added!");
      setWorkTypeId(""); setDescription(""); setQuantity(""); setShowForm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("work_scope_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-scope", clientId] });
      queryClient.invalidateQueries({ queryKey: ["work-scope-counts"] });
      toast.success("Deleted!");
    },
  });

  const selectedType = masterTypes.find((t) => t.id === workTypeId);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Items ({items.length})</p>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-1 h-3 w-3" />Add
        </Button>
      </div>

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); addItem.mutate(); }} className="space-y-3 rounded-lg border p-3">
          <div className="space-y-1">
            <Label>Work Type</Label>
            <Select value={workTypeId} onValueChange={setWorkTypeId}>
              <SelectTrigger><SelectValue placeholder="Select work type..." /></SelectTrigger>
              <SelectContent className="bg-popover">{masterTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.type_of_work} — {t.sub_work}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {selectedType && <p className="text-xs text-muted-foreground">Sub Work: <span className="font-medium">{selectedType.sub_work}</span></p>}
          <div className="space-y-1"><Label>Quantity (optional)</Label><Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
          <div className="space-y-1"><Label>Notes (optional)</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <Button type="submit" size="sm" disabled={!workTypeId || addItem.isPending}>Save</Button>
        </form>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{(item as any).master_work_types?.type_of_work}</p>
              <p className="text-xs text-muted-foreground">{(item as any).master_work_types?.sub_work}</p>
              {item.quantity && <Badge variant="secondary" className="mt-1 text-xs">Qty: {item.quantity}</Badge>}
              {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
            </div>
            <Button size="icon" variant="ghost" onClick={() => deleteItem.mutate(item.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WorkScopeSection;
