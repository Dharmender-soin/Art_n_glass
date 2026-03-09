// tmp/seed.ts
import { createClient } from '@supabase/supabase-js';
import { faker } from '@faker-js/faker';
import * as dotenv from 'dotenv';
import { addDays, subDays, startOfWeek, endOfWeek, format, isBefore, isAfter } from 'date-fns';

// Load env vars
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
// We need the SERVICE ROLE KEY to bypass RLS, but we can try with the ANON key if RLS allows inserts for testing, or we assume a test user token.
// Assuming we are pushing data for an existing showroom and existing users.
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!; 
const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
    console.log("Starting seeding...");
    
    // We need some existing setup: showrooms, users, etc.
    const { data: showrooms, error: shError } = await supabase.from('showrooms').select('id').limit(1);
    if (shError || !showrooms || showrooms.length === 0) {
         console.error("No showrooms found. Cannot seed.");
         return;
    }
    const showroomId = showrooms[0].id;
    console.log(`Found showroom: ${showroomId}`);

    // Get users in this showroom
    const { data: userRoles, error: urError } = await supabase.from('user_roles').select('user_id').eq('showroom_id', showroomId);
     if (urError || !userRoles || userRoles.length === 0) {
         console.error("No users found in showroom. Cannot seed.");
         return;
    }
    const userIds = userRoles.map(ur => ur.user_id);
    console.log(`Found ${userIds.length} users in showroom.`);

    // Get a client
    const { data: clients, error: clError } = await supabase.from('clients').select('id').limit(1);
    const clientId = clients?.[0]?.id;

    // Get a work type
    const { data: workTypes, error: wtError } = await supabase.from('master_work_types').select('id').limit(1);
    const workTypeId = workTypes?.[0]?.id;

    // Date range: This week
    const now = new Date();
    const startOfWeekDate = startOfWeek(now, { weekStartsOn: 1 });
    const endOfWeekDate = endOfWeek(now, { weekStartsOn: 1 });

    const visitsToInsert: any[] = [];
    const wosToInsert: any[] = [];

    userIds.forEach(userId => {
        // Generate 5-10 visits for this week
        const numVisits = faker.number.int({ min: 5, max: 15 });
        for (let i = 0; i < numVisits; i++) {
             // Random day this week
             const visitDate = faker.date.between({ from: startOfWeekDate, to: endOfWeekDate });
             const isDone = faker.datatype.boolean();
             
             visitsToInsert.push({
                 created_by: userId,
                 client_id: clientId || null,
                 visit_date: format(visitDate, 'yyyy-MM-dd'),
                 purpose: faker.lorem.sentence(),
                 status: isDone ? 'done' : 'planned',
                 visit_with_type: 'client',
                 address: faker.location.streetAddress()
             });
        }

        // Generate 2-5 WOS items for this week
        const numWos = faker.number.int({ min: 2, max: 8 });
        for (let i = 0; i < numWos; i++) {
            const isWon = faker.datatype.boolean();
            const amount = faker.number.float({ min: 1, max: 50, fractionDigits: 1 });
            
            wosToInsert.push({
                 created_by: userId,
                 client_id: clientId || null,
                 work_type_id: workTypeId || null,
                 amount_in_lac: amount,
                 work_status: isWon ? 'won' : 'submitted',
                 is_verified: isWon,
                 verified_amount: isWon ? amount : null,
                 description: faker.lorem.words(3)
            });
        }
    });

    console.log(`Inserting ${visitsToInsert.length} visits...`);
    const { error: vError } = await supabase.from('visits').insert(visitsToInsert);
    if(vError) console.error("Error inserting visits:", vError.message);
    else console.log("Visits inserted successfully.");

    if (workTypeId && clientId) {
         console.log(`Inserting ${wosToInsert.length} WOS items...`);
         const { error: wError } = await supabase.from('work_scope_items').insert(wosToInsert);
         if(wError) console.error("Error inserting WOS:", wError.message);
         else console.log("WOS items inserted successfully.");
    } else {
         console.log("Skipping WOS insert, missing client or work type.");
    }

    console.log("Seeding complete!");
}

seed().catch(console.error);
