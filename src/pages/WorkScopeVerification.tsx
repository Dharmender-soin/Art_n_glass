import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldCheck, IndianRupee, Search, CheckCircle, Package } from "lucide-react";
import { Navigate } from "react-router-dom";

const WorkScopeVerification = () => {
  const { user, role, showroomId } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = role === "admin";
  const isManager = role === "manager";

  const [searchClient, setSearchClient] = useState("");
  const [filterShowroom, setFilterShowroom] = useState<string>(isManager && showroomId ? showroomId : "all");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: showrooms = [] } = useQuery({
    queryKey: ["showrooms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("showrooms").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: workItems = [], isLoading } = useQuery({
    queryKey: ["work-scope-verification", filterShowroom],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_scope_items")
        .select("*, master_work_types(type_of_work, sub_work), clients(name, city)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const verifyItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("work_scope_items")
        .update({ is_verified: true, verified_by: user!.id, verified_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-scope-verification"] });
      toast.success("Item verified!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unverifyItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("work_scope_items")
        .update({ is_verified: false, verified_by: null, verified_at: null })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-scope-verification"] });
      toast.success("Verification removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Group items by client
  const clientGroups = useMemo(() => {
    let items = workItems;

    if (searchClient) {
      items = items.filter((i) =>
        ((i as any).clients?.name || "").toLowerCase().includes(searchClient.toLowerCase())
      );
    }

    if (filterStatus === "verified") {
      items = items.filter((i) => i.is_verified);
    } else if (filterStatus === "pending") {
      items = items.filter((i) => !i.is_verified);
    }

    const groups: Record<string, { clientName: string; clientCity: string; items: typeof items; totalAmount: number; verifiedAmount: number }> = {};

    items.forEach((item) => {
      const clientId = item.client_id;
      const clientName = (item as any).clients?.name || "Unknown";
      const clientCity = (item as any).clients?.city || "";

      if (!groups[clientId]) {
        groups[clientId] = { clientName, clientCity, items: [], totalAmount: 0, verifiedAmount: 0 };
      }
      groups[clientId].items.push(item);
      const amt = item.amount_in_lac || 0;
      groups[clientId].totalAmount += amt;
      if (item.is_verified) {
        groups[clientId].verifiedAmount += amt;
      }
    });

    return Object.entries(groups).sort((a, b) => a[1].clientName.localeCompare(b[1].clientName));
  }, [workItems, searchClient, filterStatus]);

  const totalAmount = workItems.reduce((s, i) => s + (i.amount_in_lac || 0), 0);
  const verifiedAmount = workItems.filter((i) => i.is_verified).reduce((s, i) => s + (i.amount_in_lac || 0), 0);
  const pendingCount = workItems.filter((i) => !i.is_verified).length;
  const verifiedCount = workItems.filter((i) => i.is_verified).length;

  // Only admin/manager can access
  if (!isAdmin && !isManager) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Work Scope Verification
          </h1>
          <p className="text-sm text-muted-foreground">
            Verify client work scope items and track total project value
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8 w-[180px]"
              placeholder="Search client..."
              value={searchClient}
              onChange={(e) => setSearchClient(e.target.value)}
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
            </SelectContent>
          </Select>
          {isAdmin && (
            <Select value={filterShowroom} onValueChange={setFilterShowroom}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Showrooms" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Showrooms</SelectItem>
                {showrooms.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <IndianRupee className="h-6 w-6 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{totalAmount.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">Total (Lac)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <IndianRupee className="h-6 w-6 mx-auto text-[hsl(var(--status-converted))] mb-1" />
            <p className="text-2xl font-bold">{verifiedAmount.toFixed(1)}</p>
            <p className="text-xs text-muted-foreground">Verified (Lac)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-6 w-6 mx-auto text-[hsl(var(--status-converted))] mb-1" />
            <p className="text-2xl font-bold">{verifiedCount}</p>
            <p className="text-xs text-muted-foreground">Verified Items</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Package className="h-6 w-6 mx-auto text-[hsl(var(--status-new))] mb-1" />
            <p className="text-2xl font-bold">{pendingCount}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Client-wise grouped list */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading...</p>
      ) : clientGroups.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No work scope items found.</p>
      ) : (
        <div className="space-y-4">
          {clientGroups.map(([clientId, group]) => (
            <Card key={clientId}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{group.clientName}</CardTitle>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs">
                      ₹{group.totalAmount.toFixed(1)} Lac Total
                    </Badge>
                    <Badge className="bg-[hsl(var(--status-converted))] text-white text-xs border-0">
                      ₹{group.verifiedAmount.toFixed(1)} Lac Verified
                    </Badge>
                  </div>
                </div>
                {group.clientCity && (
                  <p className="text-xs text-muted-foreground">{group.clientCity}</p>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {group.items.map((item) => {
                    const wt = (item as any).master_work_types;
                    return (
                      <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium">
                            {wt?.type_of_work} → {wt?.sub_work || "Unknown"}
                          </p>
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            {item.quantity && <span>Qty: {item.quantity}</span>}
                            {item.amount_in_lac != null && item.amount_in_lac > 0 && (
                              <span>₹{item.amount_in_lac} Lac</span>
                            )}
                            {item.description && <span>{item.description}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {item.is_verified ? (
                            <>
                              <Badge className="bg-[hsl(var(--status-converted))] text-white text-xs border-0">
                                Verified
                              </Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs h-7"
                                onClick={() => unverifyItem.mutate(item.id)}
                              >
                                Undo
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7"
                              onClick={() => verifyItem.mutate(item.id)}
                              disabled={verifyItem.isPending}
                            >
                              <ShieldCheck className="h-3 w-3 mr-1" />
                              Verify
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkScopeVerification;
