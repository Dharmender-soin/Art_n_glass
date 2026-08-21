import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/layout/AppLayout";
import Auth from "./pages/Auth";
import { lazy, Suspense } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { AnimatePresence } from "framer-motion";
import PageTransition from "@/components/PageTransition";
import { AIAssistant } from "@/components/AIAssistant";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useBackgroundTracking } from "@/hooks/useBackgroundTracking";
import { supabase } from "@/integrations/supabase/client";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Partners = lazy(() => import("./pages/Partners"));
const Clients = lazy(() => import("./pages/Clients"));
const Visits = lazy(() => import("./pages/Visits"));
const Reports = lazy(() => import("./pages/Reports"));
const Profile = lazy(() => import("./pages/Profile"));
const Admin = lazy(() => import("./pages/Admin"));
const DailyVisitDashboard = lazy(() => import("./pages/DailyVisitDashboard"));
const Verification = lazy(() => import("./pages/Verification"));
const Hierarchy = lazy(() => import("./pages/Hierarchy"));
const LiveMapPage = lazy(() => import("./pages/LiveMap"));
const Conveyance = lazy(() => import("./pages/Conveyance"));
const PartnerVisits = lazy(() => import("./pages/PartnerVisits"));
const NotFound = lazy(() => import("./pages/NotFound"));
const MyPipeline = lazy(() => import("./pages/MyPipeline"));
const MDDashboard = lazy(() => import("./pages/MDDashboard"));
const NotificationsCenter = lazy(() => import("./pages/NotificationsCenter"));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings"));
const NotificationLogs = lazy(() => import("./pages/NotificationLogs"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes cache
      refetchOnWindowFocus: false, // disable reload on window focus
      retry: 1, // snappier error handling
    },
  },
});

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground animate-fade-in">Loading...</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  return (
    <AppLayout>
      <PageTransition>{children}</PageTransition>
      <AIAssistant />
    </AppLayout>
  );
};

const AuthRoute = () => {
  const { user, loading, role } = useAuth();
  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground animate-fade-in">Loading...</p>
      </div>
    </div>
  );
  if (user) {
    // Accountant lands on Conveyance page by default
    if (role === "accountant") return <Navigate to="/conveyance" replace />;
    return <Navigate to="/" replace />;
  }
  return (
    <PageTransition>
      <Auth />
    </PageTransition>
  );
};

// Accountant ko / route pe Conveyance dikhao, baaki ko Dashboard
const RoleBasedHome = () => {
  const { role } = useAuth();
  if (role === "accountant") return <Navigate to="/conveyance" replace />;
  return <Dashboard />;
};

const todayKey = () => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const GlobalLocationTracker = () => {
  const { user, role } = useAuth();
  const dateStr = todayKey();
  const canTrack =
    role === "executive" ||
    role === "backhand_executive" ||
    role === "tl" ||
    role === "manager";

  const { data: todayAttendance } = useQuery({
    queryKey: ["global-daily-attendance", user?.id, dateStr],
    enabled: !!user?.id && canTrack,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_attendance")
        .select("id")
        .eq("user_id", user!.id)
        .eq("date", dateStr)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });

  const { data: endDayRecord } = useQuery({
    queryKey: ["global-end-day-record", user?.id, dateStr],
    enabled: !!user?.id && canTrack,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conveyance_records")
        .select("id")
        .eq("user_id", user!.id)
        .eq("date", dateStr)
        .is("visit_id", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
  });

  useBackgroundTracking({
    active: !!(user?.id && canTrack && todayAttendance && !endDayRecord),
    userId: user?.id,
  });

  return null;
};

const AnimatedRoutes = () => {
  const { user } = useAuth();
  usePushNotifications(user?.id);

  const location = useLocation();

  return (
    <>
    <GlobalLocationTracker />
    <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/auth" element={<AuthRoute />} />
        <Route path="/" element={
          <ProtectedRoute>
            {/* Accountant defaults to Conveyance page */}
            <RoleBasedHome />
          </ProtectedRoute>
        } />
        <Route path="/partners" element={<ProtectedRoute><Partners /></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
        <Route path="/visits" element={<ProtectedRoute><Visits /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
        <Route path="/daily-visits" element={<ProtectedRoute><DailyVisitDashboard /></ProtectedRoute>} />
        <Route path="/verification" element={<ProtectedRoute><Verification /></ProtectedRoute>} />
        <Route path="/hierarchy" element={<ProtectedRoute><Hierarchy /></ProtectedRoute>} />
        <Route path="/live-map" element={<ProtectedRoute><LiveMapPage /></ProtectedRoute>} />
        <Route path="/conveyance" element={<ProtectedRoute><Conveyance /></ProtectedRoute>} />
        <Route path="/partner-visits" element={<ProtectedRoute><PartnerVisits /></ProtectedRoute>} />
        <Route path="/my-pipeline" element={<ProtectedRoute><MyPipeline /></ProtectedRoute>} />
        <Route path="/md-dashboard" element={<ProtectedRoute><MDDashboard /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsCenter /></ProtectedRoute>} />
        <Route path="/notification-settings" element={<ProtectedRoute><NotificationSettings /></ProtectedRoute>} />
        <Route path="/notification-logs" element={<ProtectedRoute><NotificationLogs /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence>
    </Suspense>
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AnimatedRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
