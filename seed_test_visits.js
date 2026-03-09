import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { join } from 'path'

// Load .env from root
dotenv.config({ path: join(process.cwd(), '.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function seedTestData() {
  console.log('Seeding test data for dharmm@gmail.com...')
  
  // 1. Get user ID for dharmm@gmail.com
  const { data: users, error: userError } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('email', 'dharmm@gmail.com')
    .single()
    
  if (userError || !users) {
    console.error('Error fetching user dharmm@gmail.com. Please ensure the user exists and has a profile:', userError)
    
    // Fallback: Just grab the first executive for testing if we can't find dharmm
    console.log("Trying to find ANY executive user instead...")
    const { data: fallbackUsers } = await supabase.from('profiles').select('user_id').limit(1)
    if(fallbackUsers && fallbackUsers.length > 0) {
        console.log(`Found fallback user: ${fallbackUsers[0].user_id}. Proceeding with this user.`)
        await createMockVisits(fallbackUsers[0].user_id);
    } else {
        console.log("No users found in profiles to attach visits to.");
    }
    return
  }

  console.log('Found user:', users.user_id)
  await createMockVisits(users.user_id);
}

async function createMockVisits(userId) {
     const today = new Date().toISOString().split('T')[0];
     console.log(`Creating 4 planned visits for today (${today}) for user ${userId}...`);

    // We need some partners or clients to attach the visits to
    const { data: clients } = await supabase.from('clients').select('id, name').limit(1);
    const clientId = clients && clients.length > 0 ? clients[0].id : null;

    if(!clientId) {
         console.error("No clients found in the database. Cannot create test visits.");
         return;
    }

    // Insert 4 planned visits
    const visitsToInsert = [
        {
            created_by: userId,
            client_id: clientId,
            visit_date: today,
            visit_with_type: 'client',
            purpose: 'Introductory Meeting',
            status: 'planned'
        },
        {
            created_by: userId,
            client_id: clientId,
            visit_date: today,
            visit_with_type: 'client',
            purpose: 'Follow-up',
            status: 'planned'
        },
        {
            created_by: userId,
            client_id: clientId,
            visit_date: today,
            visit_with_type: 'client',
            purpose: 'Product Demo',
            status: 'planned'
        },
        {
            created_by: userId,
            client_id: clientId,
            visit_date: today,
            visit_with_type: 'client',
            purpose: 'Contract Negotiation',
            status: 'planned'
        }
    ];

    const { error } = await supabase.from('visits').insert(visitsToInsert);

    if (error) {
        console.error("Failed to insert mock visits:", error);
    } else {
        console.log("\n✅ Successfully inserted 4 PLANNED visits for today!");
        console.log("👉 Please log in to the application as this executive to test the workflow.");
        console.log("    1. Click 'Start Day / Check In' on the dashboard.");
        console.log("    2. Go to Visits page, mark the first 3 visits as 'Done'.");
        console.log("    3. Leave the 4th visit as 'Planned'.");
        console.log("    4. Click 'End Day' on the dashboard.");
        console.log("    5. Check the Reports -> Conveyance Audit Report to verify.");
    }
}

seedTestData()
