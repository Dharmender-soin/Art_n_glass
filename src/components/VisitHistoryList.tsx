import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin, CalendarCheck, FileText, Clock, UserCircle, Route } from "lucide-react";
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
  const [selectedVisit, setSelectedVisit] = useState<any | null>(null);
  const { data: visits = [], isLoading, error } = useQuery({
    queryKey: ["visit-history", clientId, partnerId],
    queryFn: async () => {
      let query = supabase
        .from("visits")
        .select("id, visit_date, status, address, remarks, purpose, done_at, created_at, created_by, check_in_at, travel_mode, photo_url, purpose_masters(purpose_name)")
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

  const creatorIds = [...new Set(visits.map((visit: any) => visit.created_by).filter(Boolean))];
  const { data: creatorNames = {} } = useQuery({
    queryKey: ["visit-history-creators", creatorIds],
    enabled: creatorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", creatorIds);
      return Object.fromEntries((data || []).map((profile) => [profile.user_id, profile.full_name]));
    },
  });

  if (isLoading) return <p className="text-muted-foreground text-center py-6">Loading visits...</p>;
  if (error) return <p className="text-destructive text-center py-6">Failed to load visits.</p>;
  if (visits.length === 0) return <p className="text-muted-foreground text-center py-6">No visit history found.</p>;

  return (
    <>
    <div className="space-y-3 mt-4">
      {visits.map((v) => (
        <Card key={v.id} className="bg-card cursor-pointer" role="button" tabIndex={0}
          onClick={() => setSelectedVisit(v)}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedVisit(v); }}>
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
    <Dialog open={!!selectedVisit} onOpenChange={(open) => !open && setSelectedVisit(null)}>
      <DialogContent className="bg-popover sm:max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><CalendarCheck className="h-5 w-5 text-primary" /> Visit Details</DialogTitle></DialogHeader>
        {selectedVisit && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3"><p className="text-[10px] uppercase text-muted-foreground">Visit date</p><p className="font-semibold">{format(parseISO(selectedVisit.visit_date), "dd MMM yyyy")}</p></div>
              <div className="rounded-lg border p-3"><p className="text-[10px] uppercase text-muted-foreground">Status</p><Badge className={`${visitStatusColors[selectedVisit.status as VisitStatus]} capitalize border-0 mt-1`}>{selectedVisit.status}</Badge></div>
            </div>
            <div className="space-y-2 text-sm">
              <p className="flex gap-2"><UserCircle className="h-4 w-4 text-primary shrink-0" /><span><b>Executive:</b> {creatorNames[selectedVisit.created_by] || "Executive"}</span></p>
              <p className="flex gap-2"><FileText className="h-4 w-4 text-primary shrink-0" /><span><b>Purpose:</b> {selectedVisit.purpose_masters?.purpose_name || selectedVisit.purpose || "General Meeting"}</span></p>
              {selectedVisit.address && <p className="flex gap-2"><MapPin className="h-4 w-4 text-primary shrink-0" /><span><b>Address:</b> {selectedVisit.address}</span></p>}
              {selectedVisit.travel_mode && <p className="flex gap-2"><Route className="h-4 w-4 text-primary shrink-0" /><span><b>Travel mode:</b> {String(selectedVisit.travel_mode).replace("_", " ")}</span></p>}
              {selectedVisit.created_at && <p className="flex gap-2"><Clock className="h-4 w-4 text-primary shrink-0" /><span><b>Planned:</b> {format(parseISO(selectedVisit.created_at), "dd MMM yyyy, p")}</span></p>}
              {selectedVisit.check_in_at && <p className="flex gap-2"><Clock className="h-4 w-4 text-primary shrink-0" /><span><b>Checked in:</b> {format(parseISO(selectedVisit.check_in_at), "dd MMM yyyy, p")}</span></p>}
              {selectedVisit.done_at && <p className="flex gap-2"><Clock className="h-4 w-4 text-primary shrink-0" /><span><b>Completed:</b> {format(parseISO(selectedVisit.done_at), "dd MMM yyyy, p")}</span></p>}
            </div>
            <div className="rounded-lg bg-muted/40 border p-3">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Visit remarks / MOM</p>
              <p className="text-sm whitespace-pre-wrap">{selectedVisit.remarks || "No remarks added."}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
};

export default VisitHistoryList;
