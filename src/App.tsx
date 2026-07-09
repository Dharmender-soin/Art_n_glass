import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/layout/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Partners from "./pages/Partners";
import Clients from "./pages/Clients";
import Visits from "./pages/Visits";
import Reports from "./pages/Reports";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import DailyVisitDashboard from "./pages/DailyVisitDashboard";
import Verification from "./pages/Verification";
import Hierarchy from "./pages/Hierarchy";
import LiveMapPage from "./pages/LiveMap";
import Conveyance from "./pages/Conveyance";
import PartnerVisits from "./pages/PartnerVisits";
import NotFound from "./pages/NotFound";
import MyPipeline from "./pages/MyPipeline";
import MDDashboard from "./pages/MDDashboard";
import { ThemeProvider } from "@/components/theme-provider";
import { AnimatePresence } from "framer-motion";
import PageTransition from "@/components/PageTransition";
import { AIAssistant } from "@/components/AIAssistant";
import { usePushNotifications } from "@/hooks/usePushNotifications";

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

const AnimatedRoutes = () => {
  const { user } = useAuth();
  usePushNotifications(user?.id);

  const location = useLocation();

  return (
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
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence>
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
