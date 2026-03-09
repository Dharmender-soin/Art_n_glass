import { subDays, format } from "date-fns";
import { Database } from "@/integrations/supabase/types";

type Visit = Database["public"]["Tables"]["visits"]["Row"] & {
    clients?: { name: string } | null;
    partners?: { name: string } | null;
    purpose_masters?: { purpose_name: string } | null;
};

const today = new Date();

export const mockOwnVisits: Visit[] = Array.from({ length: 14 }).map((_, i) => ({
    id: `visit-${i}`,
    created_by: "user-1",
    client_id: `client-${i}`,
    visit_date: format(subDays(today, i % 7), "yyyy-MM-dd"), // recent 7 days
    purpose: "Meeting",
    status: (i % 3 === 0) ? "planned" : "done",
    visit_with_type: "client",
    address: "123 Main St, Tech Park",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    partner_id: null,
    done_at: null,
    gps_latitude: null,
    gps_longitude: null,
    photo_url: null,
    planning_date: null,
    purpose_id: null,
    remarks: null,
    tat_due_date: null,
    clients: { name: `Client Focus ${i}` },
    partners: null,
    purpose_masters: { purpose_name: "Initial Discussion" }
}));

export const mockOwnWorkScopes = Array.from({ length: 10 }).map((_, i) => ({
    id: `wos-${i}`,
    client_id: `client-${i}`,
    work_type_id: `type-${i}`,
    amount_in_lac: (i + 1) * 2.5,
    created_by: "user-1",
    created_at: subDays(today, i).toISOString(),
    work_status: i % 2 === 0 ? "won" : "submitted",
    is_verified: i % 2 === 0,
    verified_amount: i % 2 === 0 ? (i + 1) * 2.5 : null,
    description: "Sample work scope",
    quantity: 1,
    verification_remarks: null,
    verified_at: null,
    verified_by: null
}));

export const mockShowroomExecs = [
    { user_id: "user-1", full_name: "Dharmender Soin" },
    { user_id: "user-2", full_name: "Rahul Sharma" },
    { user_id: "user-3", full_name: "Priya Singh" },
    { user_id: "user-4", full_name: "Amit Patel" },
    { user_id: "user-5", full_name: "Neha Gupta" }
];

export const mockShowroomVisits = [
    // User 1
    ...Array.from({ length: 24 }).map((_, i) => ({ id: `v1-${i}`, created_by: "user-1", status: "done" })),
    // User 2
    ...Array.from({ length: 18 }).map((_, i) => ({ id: `v2-${i}`, created_by: "user-2", status: "done" })),
    // User 3
    ...Array.from({ length: 30 }).map((_, i) => ({ id: `v3-${i}`, created_by: "user-3", status: "done" })),
    // User 4
    ...Array.from({ length: 12 }).map((_, i) => ({ id: `v4-${i}`, created_by: "user-4", status: "done" })),
    // User 5
    ...Array.from({ length: 22 }).map((_, i) => ({ id: `v5-${i}`, created_by: "user-5", status: "done" })),
];

export const mockShowroomWOS = [
    // User 1
    ...Array.from({ length: 8 }).map((_, i) => ({ id: `w1-${i}`, created_by: "user-1", work_status: "won", amount_in_lac: 5.5, verified_amount: 5.5 })),
    // User 2
    ...Array.from({ length: 5 }).map((_, i) => ({ id: `w2-${i}`, created_by: "user-2", work_status: "won", amount_in_lac: 8.0, verified_amount: 8.0 })),
    // User 3
    ...Array.from({ length: 12 }).map((_, i) => ({ id: `w3-${i}`, created_by: "user-3", work_status: "won", amount_in_lac: 3.2, verified_amount: 3.2 })),
    // User 4
    ...Array.from({ length: 3 }).map((_, i) => ({ id: `w4-${i}`, created_by: "user-4", work_status: "won", amount_in_lac: 12.0, verified_amount: 12.0 })),
    // User 5
    ...Array.from({ length: 7 }).map((_, i) => ({ id: `w5-${i}`, created_by: "user-5", work_status: "won", amount_in_lac: 4.5, verified_amount: 4.5 })),
];
