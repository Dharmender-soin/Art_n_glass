import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, parseISO, startOfMonth } from "date-fns";
import { CalendarCheck, Users, Building2, CheckCircle, Clock, IndianRupee, ShieldCheck, Package, MapPin } from "lucide-react";

const Reports = () => {
  const { role } = useAuth();
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: visits = [] } = useQuery({
    queryKey: ["report-visits", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits")
        .select("*, clients(name), partners(name)")
        .gte("visit_date", dateFrom)
        .lte("visit_date", dateTo)
        .order("visit_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Work scope report for managers/admins
  const isManager = role === "admin" || role === "manager" || role === "md";

  const { data: workScopeItems = [] } = useQuery({
    queryKey: ["report-work-scope", dateFrom, dateTo],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_scope_items")
        .select("*, master_work_types(type_of_work, sub_work), clients(name)")
        .gte("created_at", dateFrom)
        .lte("created_at", dateTo + "T23:59:59")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const planned = visits.filter((v) => v.status === "planned").length;
  const done = visits.filter((v) => v.status === "done").length;
  const uniqueClients = new Set(visits.filter((v) => v.client_id).map((v) => v.client_id)).size;
  const uniquePartners = new Set(visits.filter((v) => v.partner_id).map((v) => v.partner_id)).size;

  const totalWorkAmount = workScopeItems.reduce((sum, i) => sum + ((i as any).amount_in_lac || 0), 0);
  const verifiedWorkAmount = workScopeItems.filter((i) => (i as any).is_verified).reduce((sum, i) => sum + ((i as any).amount_in_lac || 0), 0);
  const verifiedCount = workScopeItems.filter((i) => (i as any).is_verified).length;

  // EVR: Partner visit summary
  const partnerVisitMap = new Map<string, { name: string; address: string; count: number }>();
  visits.filter((v) => v.partner_id && (v as any).partners?.name).forEach((v) => {
    const pid = v.partner_id!;
    const existing = partnerVisitMap.get(pid);
    if (existing) {
      existing.count++;
    } else {
      partnerVisitMap.set(pid, {
        name: (v as any).partners.name,
        address: v.address || "—",
        count: 1,
      });
    }
  });
  const partnerVisitList = Array.from(partnerVisitMap.values()).sort((a, b) => b.count - a.count);

  // EVR: Client visit summary
  const clientVisitMap = new Map<string, { name: string; address: string; count: number }>();
  visits.filter((v) => v.client_id && (v as any).clients?.name).forEach((v) => {
    const cid = v.client_id!;
    const existing = clientVisitMap.get(cid);
    if (existing) {
      existing.count++;
    } else {
      clientVisitMap.set(cid, {
        name: (v as any).clients.name,
        address: v.address || "—",
        count: 1,
      });
    }
  });
  const clientVisitList = Array.from(clientVisitMap.values()).sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>

      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <Label>From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>To</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {/* Visit Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4 text-center"><Clock className="h-6 w-6 mx-auto text-[hsl(var(--status-new))] mb-1" /><p className="text-2xl font-bold">{planned}</p><p className="text-xs text-muted-foreground">Planned</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><CheckCircle className="h-6 w-6 mx-auto text-[hsl(var(--status-converted))] mb-1" /><p className="text-2xl font-bold">{done}</p><p className="text-xs text-muted-foreground">Done</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><Users className="h-6 w-6 mx-auto text-primary mb-1" /><p className="text-2xl font-bold">{uniqueClients}</p><p className="text-xs text-muted-foreground">Unique Clients</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><Building2 className="h-6 w-6 mx-auto text-primary mb-1" /><p className="text-2xl font-bold">{uniquePartners}</p><p className="text-xs text-muted-foreground">Unique Partners</p></CardContent></Card>
      </div>

      {/* Work Scope Summary — Manager/Admin only */}
      {isManager && (
        <>
          <Separator />
          <h2 className="text-lg font-bold flex items-center gap-2"><Package className="h-5 w-5 text-primary" />Work Scope Summary</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card><CardContent className="p-4 text-center"><Package className="h-6 w-6 mx-auto text-primary mb-1" /><p className="text-2xl font-bold">{workScopeItems.length}</p><p className="text-xs text-muted-foreground">Total Items</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><IndianRupee className="h-6 w-6 mx-auto text-primary mb-1" /><p className="text-2xl font-bold">{totalWorkAmount.toFixed(1)}</p><p className="text-xs text-muted-foreground">Total (Lac)</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><ShieldCheck className="h-6 w-6 mx-auto text-[hsl(var(--status-converted))] mb-1" /><p className="text-2xl font-bold">{verifiedCount}</p><p className="text-xs text-muted-foreground">Verified</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><IndianRupee className="h-6 w-6 mx-auto text-[hsl(var(--status-converted))] mb-1" /><p className="text-2xl font-bold">{verifiedWorkAmount.toFixed(1)}</p><p className="text-xs text-muted-foreground">Verified (Lac)</p></CardContent></Card>
          </div>

          {/* Work scope detail list */}
          {workScopeItems.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Work Scope Details</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {workScopeItems.map((item) => {
                    const wt = (item as any).master_work_types;
                    const client = (item as any).clients;
                    const verified = (item as any).is_verified;
                    const amt = (item as any).amount_in_lac;
                    return (
                      <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-medium">{client?.name || "—"} → {wt?.sub_work || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">{wt?.type_of_work} · Qty: {item.quantity || "—"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {amt != null && amt > 0 && (
                            <Badge variant="outline" className="text-xs">₹{amt} Lac</Badge>
                          )}
                          {verified ? (
                            <Badge className="bg-[hsl(var(--status-converted))] text-white text-xs border-0">Verified</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Pending</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* EVR Report — Partner Visits */}
      <Separator />
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Building2 className="h-5 w-5 text-primary" />
        EVR — Partner Visits
      </h2>
      <Card>
        <CardContent className="p-0">
          {partnerVisitList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No partner visits in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Partner</TableHead>
                  <TableHead className="text-xs">Address</TableHead>
                  <TableHead className="text-xs text-right">No. of Visits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partnerVisitList.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium py-2">{p.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground py-2">{p.address}</TableCell>
                    <TableCell className="text-sm font-bold text-right py-2">{p.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* EVR Report — Client Visits */}
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        EVR — Client Visits
      </h2>
      <Card>
        <CardContent className="p-0">
          {clientVisitList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No client visits in this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Client</TableHead>
                  <TableHead className="text-xs">Address</TableHead>
                  <TableHead className="text-xs text-right">No. of Visits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientVisitList.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium py-2">{c.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground py-2">{c.address}</TableCell>
                    <TableCell className="text-sm font-bold text-right py-2">{c.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Visit Log */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Visit Log</CardTitle></CardHeader>
        <CardContent>
          {visits.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No visits in this period.</p>
          ) : (
            <div className="space-y-2">
              {visits.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{(v as any).clients?.name || (v as any).partners?.name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{format(parseISO(v.visit_date), "dd MMM yyyy")} · {v.purpose}</p>
                  </div>
                  <Badge className={`capitalize text-xs border-0 ${v.status === "done" ? "bg-[hsl(var(--status-converted))] text-white" : v.status === "planned" ? "bg-[hsl(var(--status-new))] text-white" : "bg-[hsl(var(--status-lost))] text-white"}`}>{v.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
