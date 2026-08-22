import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AssignableUser = {
  user_id: string;
  full_name: string;
  role: string;
  showroom_id: string | null;
};

export function useAssignableUsers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["assignable-users", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_assignable_users");
      if (error) throw error;
      return (data || []) as AssignableUser[];
    },
    retry: false,
  });
}
