import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, CalendarCheck, FileText } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type VisitStatus = Database["public"]["Enums"]["visit_status"];

const visitStatusColors: Record<VisitStatus, string> = {
  planned: "bg-[hsl(var(--status-new))] text-white",
  done: "bg-[hsl(var(--status-converted))] text-white",
  cancelled: "bg-[hsl(var(--status-lost))] text-white",
};

interface VisitHistoryListProps {
  clientId?: string;
  partnerId?: string;
}

const VisitHistoryList = ({ clientId, partnerId }: VisitHistoryListProps) => {
  const { data: visits = [], isLoading, error } = useQuery({
    queryKey: ["visit-history", clientId, partnerId],
    queryFn: async () => {
      let query = supabase
        .from("visits")
        .select("id, visit_date, status, address, remarks, purpose, done_at, purpose_masters(purpose_name)")
        .order("visit_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (clientId) {
        query = query.eq("client_id", clientId);
      } else if (partnerId) {
        query = query.eq("partner_id", partnerId);
      } else {
        return [];
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!clientId || !!partnerId,
  });

  if (isLoading) return <p className="text-muted-foreground text-center py-6">Loading visits...</p>;
  if (error) return <p className="text-destructive text-center py-6">Failed to load visits.</p>;
  if (visits.length === 0) return <p className="text-muted-foreground text-center py-6">No visit history found.</p>;

  return (
    <div className="space-y-3 mt-4">
      {visits.map((v) => (
        <Card key={v.id} className="bg-card">
          <CardContent className="p-3">
            <div className="flex items-start justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <CalendarCheck className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">
                  {format(parseISO(v.visit_date), "dd MMM yyyy")}
                </span>
              </div>
              <Badge className={`${visitStatusColors[v.status]} capitalize text-[10px] border-0 px-1.5 py-0`}>
                {v.status}
              </Badge>
            </div>
            
            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="flex items-center gap-1">
                 <span className="font-medium text-foreground">Purpose:</span> 
                 {v.purpose_masters?.purpose_name || v.purpose || "General Meeting"}
              </p>
              {v.address && (
                <p className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {v.address}
                </p>
              )}
              {v.remarks && (
                <p className="flex items-start gap-1 mt-1 text-foreground/80 italic bg-muted/30 p-1.5 rounded">
                  <FileText className="h-3 w-3 mt-0.5" /> 
                  {v.remarks}
                </p>
              )}
              {v.done_at && (
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  Completed on {format(parseISO(v.done_at), "dd MMM yyyy, p")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default VisitHistoryList;
