import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, startOfMonth } from "date-fns";
import { CalendarCheck, Users, Building2, CheckCircle, Clock } from "lucide-react";

const Reports = () => {
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: visits = [] } = useQuery({
    queryKey: ["report-visits", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits")
        .select("*, clients(name), partners(name), profiles:created_by(full_name)")
        .gte("visit_date", dateFrom)
        .lte("visit_date", dateTo)
        .order("visit_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const planned = visits.filter((v) => v.status === "planned").length;
  const done = visits.filter((v) => v.status === "done").length;
  const uniqueClients = new Set(visits.filter((v) => v.client_id).map((v) => v.client_id)).size;
  const uniquePartners = new Set(visits.filter((v) => v.partner_id).map((v) => v.partner_id)).size;

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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4 text-center"><Clock className="h-6 w-6 mx-auto text-[hsl(var(--status-new))] mb-1" /><p className="text-2xl font-bold">{planned}</p><p className="text-xs text-muted-foreground">Planned</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><CheckCircle className="h-6 w-6 mx-auto text-[hsl(var(--status-converted))] mb-1" /><p className="text-2xl font-bold">{done}</p><p className="text-xs text-muted-foreground">Done</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><Users className="h-6 w-6 mx-auto text-primary mb-1" /><p className="text-2xl font-bold">{uniqueClients}</p><p className="text-xs text-muted-foreground">Unique Clients</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><Building2 className="h-6 w-6 mx-auto text-primary mb-1" /><p className="text-2xl font-bold">{uniquePartners}</p><p className="text-xs text-muted-foreground">Unique Partners</p></CardContent></Card>
      </div>

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
