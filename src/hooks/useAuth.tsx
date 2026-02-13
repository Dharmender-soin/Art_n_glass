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
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  showroomId: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [showroomId, setShowroomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = async (userId: string) => {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role, showroom_id")
      .eq("user_id", userId);

    if (roles && roles.length > 0) {
      // Prioritize: admin > manager > executive
      const prioritized = roles.find(r => r.role === "admin")
        || roles.find(r => r.role === "manager")
        || roles[0];
      setRole(prioritized.role);
      setShowroomId(prioritized.showroom_id);
    } else {
      // Auto-assign executive role for new users
      const { error } = await supabase.from("user_roles").insert({
        user_id: userId,
        role: "executive" as AppRole,
      });
      if (!error) {
        setRole("executive");
      } else {
        setRole("executive");
      }
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
    <AuthContext.Provider value={{ user, session, role, showroomId, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
