import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  showroomId: string | null;
  reportsTo: string | null;   // TL's user_id (for exec), Manager's user_id (for TL)
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  showroomId: null,
  reportsTo: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [showroomId, setShowroomId] = useState<string | null>(null);
  const [reportsTo, setReportsTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const rolePriority: Record<AppRole, number> = {
    md: 6,
    admin: 5,
    manager: 4,
    tl: 3,
    accountant: 2,  // Higher than executive so accountant wins if both exist
    executive: 1,
    backhand_executive: 1,
  };

  const fetchRole = async (userId: string) => {
    // Cast to unknown[] to handle reports_to column before DB migration
    const { data: rawData, error } = await supabase
      .from("user_roles")
      .select("role, showroom_id")
      .eq("user_id", userId);

    type RoleRow = { role: AppRole; showroom_id: string | null; reports_to?: string | null };
    const data = rawData as RoleRow[] | null;

    if (error) {
      console.error("Error fetching role:", error);
      return;
    }

    if (data && data.length > 0) {
      // Pick highest priority role
      const best = data.reduce((a, b) =>
        (rolePriority[a.role] || 0) >= (rolePriority[b.role] || 0) ? a : b
      );
      setRole(best.role);
      setShowroomId(best.showroom_id);
      setReportsTo(best.reports_to ?? null);
    } else {
      // Auto-assign executive role for new users
      await supabase.from("user_roles").insert({
        user_id: userId,
        role: "executive" as AppRole,
      });
      setRole("executive");
      setReportsTo(null);
    }
  };

  const ensureProfile = async (userId: string, fullName: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!data) {
      await supabase.from("profiles").insert({
        user_id: userId,
        full_name: fullName || "",
      });
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => {
            fetchRole(session.user.id);
            ensureProfile(session.user.id, session.user.user_metadata?.full_name || "");
          }, 0);
        } else {
          setRole(null);
          setShowroomId(null);
          setReportsTo(null);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRole(session.user.id);
        ensureProfile(session.user.id, session.user.user_metadata?.full_name || "");
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, role, showroomId, reportsTo, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
