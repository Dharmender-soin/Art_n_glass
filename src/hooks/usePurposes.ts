import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type VisitWithType = Database["public"]["Enums"]["visit_with_type"];
type PurposeMaster = Database["public"]["Tables"]["purpose_masters"]["Row"];

export const usePurposes = (entityType?: string) => {
    return useQuery({
        queryKey: ["purposes", entityType],
        queryFn: async () => {
            let query = supabase
                .from("purpose_masters")
                .select("*")
                .eq("is_active", true)
                .order("purpose_name");

            if (entityType) {
                query = query.eq("entity_type", entityType as unknown as VisitWithType);
            }

            const { data, error } = await query;
            if (error) throw error;
            // If specific entity_type has no matching purposes, fetch general active purposes
            if ((!data || data.length === 0) && entityType) {
                const { data: fallbackData } = await supabase
                    .from("purpose_masters")
                    .select("*")
                    .eq("is_active", true)
                    .order("purpose_name");
                return (fallbackData || []) as PurposeMaster[];
            }
            return data as PurposeMaster[];
        },
        // Cache for 10 minutes since master data rarely changes
        staleTime: 10 * 60 * 1000,
    });
};
