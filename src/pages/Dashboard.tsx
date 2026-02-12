import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, Users, CalendarCheck, CheckCircle, XCircle, Clock, Briefcase } from "lucide-react";
import logo from "@/assets/logo.png";

const Dashboard = () => {
  const { role } = useAuth();
  const isManager = role === "admin" || role === "manager";

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [partnersRes, clientsRes, visitsRes, workScopeRes] = await Promise.all([
        supabase.from("partners").select("id", { count: "exact", head: true }),
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("visits").select("id, status"),
        supabase.from("work_scope_items").select("id", { count: "exact", head: true }),
      ]);

      const visits = visitsRes.data || [];
      return {
        partners: partnersRes.count || 0,
        clients: clientsRes.count || 0,
        totalVisits: visits.length,
        plannedVisits: visits.filter((v) => v.status === "planned").length,
        doneVisits: visits.filter((v) => v.status === "done").length,
        cancelledVisits: visits.filter((v) => v.status === "cancelled").length,
        workScope: workScopeRes.count || 0,
      };
    },
  });

  const cards = [
    { label: "Partners", value: stats?.partners ?? 0, icon: Building2, color: "text-primary" },
    { label: "Clients", value: stats?.clients ?? 0, icon: Users, color: "text-primary" },
    { label: "Total Visits", value: stats?.totalVisits ?? 0, icon: CalendarCheck, color: "text-primary" },
    { label: "Planned", value: stats?.plannedVisits ?? 0, icon: Clock, color: "text-[hsl(var(--status-new))]" },
    { label: "Done", value: stats?.doneVisits ?? 0, icon: CheckCircle, color: "text-[hsl(var(--status-converted))]" },
    { label: "Cancelled", value: stats?.cancelledVisits ?? 0, icon: XCircle, color: "text-[hsl(var(--status-lost))]" },
    { label: "Work Scope Items", value: stats?.workScope ?? 0, icon: Briefcase, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <img src={logo} alt="Art-N-Glass" className="h-10 w-auto md:hidden" />
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {isManager ? "Overview of all team activity" : "Your activity overview"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold">{value}</p>
                </div>
                <Icon className={`h-8 w-8 ${color} opacity-80`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
