import { useAuth } from "@/hooks/useAuth";
import { LiveTracking } from "@/components/dashboard/LiveTracking";
import { Map, Navigation } from "lucide-react";

const LiveMapPage = () => {
  const { role } = useAuth();

  const canAccess = role === "admin" || role === "md" || role === "manager";

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Navigation className="h-12 w-12 text-slate-300" />
        <p className="text-slate-500 font-semibold text-lg">Access Denied</p>
        <p className="text-slate-400 text-sm">Live Map is available for Managers, MDs and Admins only.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Compact Page Header */}
      <div className="flex items-center gap-2.5 mb-2.5 shrink-0">
        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#b91c1c] to-[#7f1d1d] flex items-center justify-center shadow-md shrink-0">
          <Map className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">Live Map</h1>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-tight">
            {role === "manager" ? "Your showroom · real-time" : "All showrooms · real-time"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wider">Live</span>
        </div>
      </div>

      {/* Map Component */}
      <div className="flex-1 min-h-0">
        <LiveTracking />
      </div>
    </div>
  );
};

export default LiveMapPage;
