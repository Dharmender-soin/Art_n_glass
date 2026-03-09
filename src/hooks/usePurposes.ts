import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

type VisitWithType = Database["public"]["Enums"]["visit_with_type"];
type PurposeMaster = Database["public"]["Tables"]["purpose_masters"]["Row"];

export const usePurposes = (entityType?: VisitWithType) => {
    return useQuery({
        queryKey: ["purposes", entityType],
        queryFn: async () => {
            let query = supabase
                .from("purpose_masters")
                .select("*")
                .eq("is_active", true)
                .order("purpose_name");

            if (entityType) {
                query = query.eq("entity_type", entityType);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as PurposeMaster[];
        },
        // Cache for 10 minutes since master data rarely changes
        staleTime: 10 * 60 * 1000,
    });
};
