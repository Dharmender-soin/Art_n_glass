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
import { Plus, Trash2, Package, Layers, FileText, Hash, CheckCircle, ShieldCheck, Send } from "lucide-react";

const WorkScopeSection = ({ clientId }: { clientId: string }) => {
  const { user, role } = useAuth();
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
        work_status: "pending",  // Always start as WOS — executive marks quotation separately
        created_by: user!.id,
      });
      if (error) {
        // DB unique constraint violation — duplicate WOS
        if (error.code === "23505") throw new Error("This work type has already been added for this client. Duplicates are not allowed.");
        throw error;
      }
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

  // Executive marks quotation as sent
  const markQuotation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("work_scope_items")
        .update({ work_status: "submitted", submitted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-scope", clientId] });
      queryClient.invalidateQueries({ queryKey: ["wos-h3"] });
      toast.success("Quotation marked as sent!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verifyItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("work_scope_items").update({
        is_verified: true,
        verified_by: user!.id,
        verified_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-scope", clientId] });
      toast.success("Work scope verified!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groupedTypes = masterTypes.reduce((acc, t) => {
    if (!acc[t.type_of_work]) acc[t.type_of_work] = [];
    acc[t.type_of_work].push(t);
    return acc;
  }, {} as Record<string, typeof masterTypes>);

  const selectedType = masterTypes.find((t) => t.id === workTypeId);
  const isManager = role === "admin" || role === "manager" || role === "md";


  const verifiedCount = items.filter((item) => (item as any).is_verified).length;

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

      {/* Summary bar */}
      {items.length > 0 && (
        <div className="flex justify-center items-center rounded-xl border border-red-100 bg-red-50/50 px-4 py-3 text-sm">
          <span className="flex flex-col items-center">
             <span className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
               <ShieldCheck className="h-3 w-3" /> Verified
             </span>
             <span className="font-semibold text-muted-foreground text-base mt-0.5">{verifiedCount}/{items.length}</span>
          </span>
        </div>
      )}

      <Separator />

      {/* Add Form */}
      {showForm && (
        <Card className="border-red-100 bg-red-50/30 shadow-none">
          <CardContent className="p-4">
            <form onSubmit={(e) => { e.preventDefault(); addItem.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 font-semibold text-foreground/80">
                  <Layers className="h-4 w-4" />Work Type
                </Label>
                <Select value={workTypeId} onValueChange={setWorkTypeId}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="Select work type..." /></SelectTrigger>
                  <SelectContent className="bg-popover max-h-[300px]">
                    {Object.entries(groupedTypes).map(([group, types]) => (
                      <div key={group}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group}</div>
                        {types.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.sub_work}</SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedType && (
                <div className="rounded-md bg-white border border-red-50 p-2 text-xs flex flex-wrap gap-1.5 items-center">
                  <Badge variant="secondary" className="bg-red-50 text-red-600 hover:bg-red-100 py-0.5">{selectedType.type_of_work}</Badge>
                  <span className="text-muted-foreground font-medium">{selectedType.sub_work}</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 font-semibold text-foreground/80">
                    <Hash className="h-4 w-4" />Quantity
                  </Label>
                  <Input type="number" placeholder="e.g. 10" className="bg-white" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 font-semibold text-foreground/80">
                    <FileText className="h-4 w-4" />Notes
                  </Label>
                  <Textarea placeholder="Additional details..." className="bg-white resize-none" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                </div>
              </div>

              <Button type="submit" size="default" className="w-full bg-red-400 hover:bg-red-500 text-white shadow-sm mt-3" disabled={!workTypeId || addItem.isPending}>
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
            const verified = (item as any).is_verified;
            const wStatus: string = (item as any).work_status || "pending";
            const isPending  = wStatus === "pending" || wStatus === "draft";
            const isQuotation = wStatus === "submitted";
            const isWon  = wStatus === "won";
            const isLost = wStatus === "lost";
            const isOwnItem = item.created_by === user?.id;

            // Pipeline badge config
            const pipelineBadge = isPending
              ? { label: "WOS",       cls: "text-sky-700 bg-sky-50 border-sky-200" }
              : isQuotation
              ? { label: "Quotation", cls: "text-amber-700 bg-amber-50 border-amber-200" }
              : isWon
              ? { label: "Won ✓",     cls: "text-emerald-700 bg-emerald-50 border-emerald-200" }
              : { label: "Lost",      cls: "text-rose-600 bg-rose-50 border-rose-200" };

            return (
              <Card key={item.id} className={`group hover:shadow-sm transition-shadow rounded-2xl ${verified ? "border-[hsl(var(--status-converted))]/30" : ""}`}>
                <CardContent className="p-3.5 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <p className="text-base font-bold text-foreground">{wt?.sub_work || "Unknown"}</p>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-background">{wt?.type_of_work}</Badge>
                      {/* Pipeline status badge */}
                      <span className={`inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded border ${pipelineBadge.cls}`}>
                        {pipelineBadge.label}
                      </span>
                      {verified && (
                        <Badge className="bg-[hsl(var(--status-converted))] text-white text-[10px] px-1.5 py-0 border-0">
                          <CheckCircle className="h-2.5 w-2.5 mr-0.5" />Verified
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {item.quantity && (
                        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                          <Hash className="h-3.5 w-3.5" />Qty: <span className="font-semibold text-foreground/80">{item.quantity}</span>
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{item.description}</p>
                    )}
                    {/* Quotation Sent button — for executive only, on pending WOS items */}
                    {!isManager && isOwnItem && isPending && (
                      <button
                        onClick={() => markQuotation.mutate(item.id)}
                        disabled={markQuotation.isPending}
                        className="mt-2 flex items-center gap-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all"
                      >
                        <Send className="h-3 w-3" /> Quotation Sent
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isManager && !verified && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Verify this item"
                        onClick={() => verifyItem.mutate(item.id)}
                        className="text-[hsl(var(--status-converted))]"
                      >
                        <ShieldCheck className="h-4 w-4" />
                      </Button>
                    )}
                    {/* Delete — only admins/managers can delete a SOW once added */}
                    {isManager && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => deleteItem.mutate(item.id)}
                        disabled={verified}
                        title={verified ? "Cannot delete verified item" : "Delete"}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
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
