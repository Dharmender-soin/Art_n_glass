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
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Trash2, Package, Layers, FileText, Hash } from "lucide-react";

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
      const { data, error } = await supabase
        .from("work_scope_items")
        .select("*, master_work_types(type_of_work, sub_work)")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
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
      toast.success("Work scope item added!");
      setWorkTypeId("");
      setDescription("");
      setQuantity("");
      setShowForm(false);
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
      toast.success("Item removed!");
    },
  });

  // Group master types by type_of_work
  const groupedTypes = masterTypes.reduce((acc, t) => {
    if (!acc[t.type_of_work]) acc[t.type_of_work] = [];
    acc[t.type_of_work].push(t);
    return acc;
  }, {} as Record<string, typeof masterTypes>);

  const selectedType = masterTypes.find((t) => t.id === workTypeId);

  return (
    <div className="space-y-5 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Work Scope</h3>
          <Badge variant="secondary" className="text-xs">{items.length} items</Badge>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)} variant={showForm ? "secondary" : "default"}>
          <Plus className="mr-1 h-3 w-3" />{showForm ? "Cancel" : "Add Item"}
        </Button>
      </div>

      <Separator />

      {/* Add Form */}
      {showForm && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <form onSubmit={(e) => { e.preventDefault(); addItem.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" />Work Type
                </Label>
                <Select value={workTypeId} onValueChange={setWorkTypeId}>
                  <SelectTrigger><SelectValue placeholder="Select work type..." /></SelectTrigger>
                  <SelectContent className="bg-popover max-h-[300px]">
                    {Object.entries(groupedTypes).map(([group, types]) => (
                      <div key={group}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group}</div>
                        {types.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.sub_work}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedType && (
                <div className="rounded-md bg-muted/50 p-2.5 text-sm">
                  <span className="text-muted-foreground">Category:</span>{" "}
                  <span className="font-medium">{selectedType.type_of_work}</span>
                  <span className="mx-1.5 text-muted-foreground">→</span>
                  <span className="font-medium text-primary">{selectedType.sub_work}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5" />Quantity
                  </Label>
                  <Input type="number" placeholder="e.g. 10" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />Notes
                  </Label>
                  <Textarea placeholder="Additional details..." value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
                </div>
              </div>

              <Button type="submit" size="sm" className="w-full" disabled={!workTypeId || addItem.isPending}>
                {addItem.isPending ? "Saving..." : "Add Work Scope Item"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Items List */}
      {items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No work scope items yet</p>
          <p className="text-xs">Click "Add Item" to define the scope of work</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const wt = (item as any).master_work_types;
            return (
              <Card key={item.id} className="group hover:shadow-sm transition-shadow">
                <CardContent className="p-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{wt?.sub_work || "Unknown"}</p>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{wt?.type_of_work}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      {item.quantity && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Hash className="h-3 w-3" />Qty: <span className="font-medium text-foreground">{item.quantity}</span>
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{item.description}</p>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={() => deleteItem.mutate(item.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default WorkScopeSection;
