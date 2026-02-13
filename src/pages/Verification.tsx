import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ShieldCheck, IndianRupee, Package, CheckCircle, XCircle, Clock, Filter } from "lucide-react";

const Verification = () => {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [verifiedAmount, setVerifiedAmount] = useState("");
  const [verificationRemarks, setVerificationRemarks] = useState("");
  const [workStatus, setWorkStatus] = useState<string>("pending");

  const canAccess = role === "admin" || role === "manager" || role === "md";

  // Fetch all work scope items with client & work type info
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["verification-items"],
    enabled: canAccess,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_scope_items")
        .select("*, master_work_types(type_of_work, sub_work), clients(name, city)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch showrooms for MD grouping
  const { data: showrooms = [] } = useQuery({
    queryKey: ["showrooms"],
    enabled: role === "md",
    queryFn: async () => {
      const { data, error } = await supabase.from("showrooms").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch user roles for showroom mapping (MD view)
  const { data: userRoles = [] } = useQuery({
    queryKey: ["user-roles-for-verification"],
    enabled: role === "md",
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, showroom_id");
      if (error) throw error;
      return data;
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItem) return;
      const { error } = await supabase
        .from("work_scope_items")
        .update({
          is_verified: true,
          verified_by: user!.id,
          verified_at: new Date().toISOString(),
          verified_amount: verifiedAmount ? parseFloat(verifiedAmount) : null,
          verification_remarks: verificationRemarks || null,
          work_status: workStatus as any,
        })
        .eq("id", selectedItem.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["verification-items"] });
      toast.success("Work scope verified and updated!");
      setSelectedItem(null);
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetForm = () => {
    setVerifiedAmount("");
    setVerificationRemarks("");
    setWorkStatus("pending");
  };

  const openVerifyDialog = (item: any) => {
    setSelectedItem(item);
    setVerifiedAmount(item.verified_amount?.toString() || item.amount_in_lac?.toString() || "");
    setVerificationRemarks(item.verification_remarks || "");
    setWorkStatus(item.work_status || "pending");
  };

  if (!canAccess) {
    return <p className="text-center text-muted-foreground py-8">Access denied.</p>;
  }

  const filteredItems = statusFilter === "all"
    ? items
    : items.filter((i: any) => i.work_status === statusFilter);

  const statusIcon = (status: string) => {
    switch (status) {
      case "won": return <CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--status-converted))]" />;
      case "lost": return <XCircle className="h-3.5 w-3.5 text-[hsl(var(--status-lost))]" />;
      default: return <Clock className="h-3.5 w-3.5 text-[hsl(var(--status-new))]" />;
    }
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "won": return "bg-[hsl(var(--status-converted))] text-white border-0";
      case "lost": return "bg-[hsl(var(--status-lost))] text-white border-0";
      default: return "bg-[hsl(var(--status-new))] text-white border-0";
    }
  };

  // Summary stats
  const totalAmount = items.reduce((s: number, i: any) => s + (i.amount_in_lac || 0), 0);
  const verifiedAmount_ = items.reduce((s: number, i: any) => s + (i.verified_amount || 0), 0);
  const wonCount = items.filter((i: any) => i.work_status === "won").length;
  const lostCount = items.filter((i: any) => i.work_status === "lost").length;
  const pendingCount = items.filter((i: any) => i.work_status === "pending").length;

  // For MD: group by showroom
  const getShowroomForItem = (item: any) => {
    const userRole = userRoles.find((ur) => ur.user_id === item.created_by);
    if (!userRole?.showroom_id) return null;
    return showrooms.find((s) => s.id === userRole.showroom_id) || null;
  };

  const renderItemCard = (item: any) => {
    const wt = item.master_work_types;
    const client = item.clients;
    const amt = item.amount_in_lac;
    const vAmt = item.verified_amount;
    return (
      <Card key={item.id} className="hover:shadow-sm transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="text-sm font-semibold">{client?.name || "—"}</p>
                {client?.city && <Badge variant="outline" className="text-[10px]">{client.city}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {wt?.type_of_work} → <span className="font-medium text-foreground">{wt?.sub_work}</span>
              </p>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {amt != null && amt > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs">
                    <IndianRupee className="h-3 w-3 text-muted-foreground" />
                    Estimated: <span className="font-medium">₹{amt} Lac</span>
                  </span>
                )}
                {vAmt != null && vAmt > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs">
                    <IndianRupee className="h-3 w-3 text-primary" />
                    Verified: <span className="font-bold text-primary">₹{vAmt} Lac</span>
                  </span>
                )}
                {item.quantity && (
                  <span className="text-xs text-muted-foreground">Qty: {item.quantity}</span>
                )}
              </div>
              {item.verification_remarks && (
                <p className="text-xs text-muted-foreground mt-1.5 italic">"{item.verification_remarks}"</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <Badge className={`text-[10px] capitalize ${statusBadgeClass(item.work_status)}`}>
                {statusIcon(item.work_status)}
                <span className="ml-1">{item.work_status}</span>
              </Badge>
              {item.is_verified && (
                <Badge className="bg-[hsl(var(--status-converted))] text-white text-[10px] border-0">
                  <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />Verified
                </Badge>
              )}
              <Button size="sm" variant="outline" onClick={() => openVerifyDialog(item)} className="text-xs">
                {item.is_verified ? "Update" : "Verify"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Work Scope Verification
        </h1>
        <p className="text-sm text-muted-foreground">Verify work scope items, update actual amounts and status</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card><CardContent className="p-3 text-center"><Package className="h-5 w-5 mx-auto text-primary mb-1" /><p className="text-xl font-bold">{items.length}</p><p className="text-[10px] text-muted-foreground">Total Items</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><IndianRupee className="h-5 w-5 mx-auto text-primary mb-1" /><p className="text-xl font-bold">{totalAmount.toFixed(1)}</p><p className="text-[10px] text-muted-foreground">Est. (Lac)</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><CheckCircle className="h-5 w-5 mx-auto text-[hsl(var(--status-converted))] mb-1" /><p className="text-xl font-bold">{wonCount}</p><p className="text-[10px] text-muted-foreground">Won</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><XCircle className="h-5 w-5 mx-auto text-[hsl(var(--status-lost))] mb-1" /><p className="text-xl font-bold">{lostCount}</p><p className="text-[10px] text-muted-foreground">Lost</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><Clock className="h-5 w-5 mx-auto text-[hsl(var(--status-new))] mb-1" /><p className="text-xl font-bold">{pendingCount}</p><p className="text-[10px] text-muted-foreground">Pending</p></CardContent></Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {/* Items — MD sees grouped by showroom */}
      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">Loading...</p>
      ) : role === "md" && showrooms.length > 0 ? (
        <div className="space-y-6">
          {showrooms.map((showroom) => {
            const showroomItems = filteredItems.filter((item: any) => {
              const sr = getShowroomForItem(item);
              return sr?.id === showroom.id;
            });
            if (showroomItems.length === 0) return null;
            return (
              <div key={showroom.id}>
                <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                  🏢 {showroom.name} — {showroom.city}
                  <Badge variant="secondary" className="text-xs">{showroomItems.length} items</Badge>
                </h2>
                <div className="space-y-2">
                  {showroomItems.map(renderItemCard)}
                </div>
              </div>
            );
          })}
          {/* Unassigned */}
          {(() => {
            const unassigned = filteredItems.filter((item: any) => !getShowroomForItem(item));
            if (unassigned.length === 0) return null;
            return (
              <div>
                <h2 className="text-lg font-bold mb-3">Unassigned Showroom</h2>
                <div className="space-y-2">{unassigned.map(renderItemCard)}</div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No work scope items found</p>
            </div>
          ) : (
            filteredItems.map(renderItemCard)
          )}
        </div>
      )}

      {/* Verify/Update Dialog */}
      <Dialog open={!!selectedItem} onOpenChange={(open) => { if (!open) { setSelectedItem(null); resetForm(); } }}>
        <DialogContent className="bg-popover">
          <DialogHeader>
            <DialogTitle>
              {selectedItem?.is_verified ? "Update Verification" : "Verify Work Scope"}
            </DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm font-medium">{selectedItem.clients?.name || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedItem.master_work_types?.type_of_work} → {selectedItem.master_work_types?.sub_work}
                </p>
                {selectedItem.amount_in_lac && (
                  <p className="text-xs mt-1">Estimated: <span className="font-medium">₹{selectedItem.amount_in_lac} Lac</span></p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <IndianRupee className="h-3.5 w-3.5" />Verified Amount (in Lac)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Actual project amount"
                  value={verifiedAmount}
                  onChange={(e) => setVerifiedAmount(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={workStatus} onValueChange={setWorkStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="won">Won</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Remarks</Label>
                <Textarea
                  placeholder="Add verification remarks..."
                  value={verificationRemarks}
                  onChange={(e) => setVerificationRemarks(e.target.value)}
                  rows={3}
                />
              </div>

              <Button
                className="w-full"
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending}
              >
                {verifyMutation.isPending ? "Saving..." : selectedItem.is_verified ? "Update Verification" : "Verify & Save"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Verification;
