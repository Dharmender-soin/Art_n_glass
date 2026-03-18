const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;

// We need the service role key to bypass RLS to read/update all records
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_MAPS_API_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GOOGLE_MAPS_API_KEY) {
  console.error("Missing required environment variables.");
  console.log("Please ensure VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and VITE_GOOGLE_MAPS_API_KEY are set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const calculateRouteDistance = async (lat1, lon1, lat2, lon2) => {
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat1},${lon1}&destinations=${lat2},${lon2}&key=${GOOGLE_MAPS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === "OK" && data.rows[0].elements[0].status === "OK") {
      const distanceInMeters = data.rows[0].elements[0].distance.value;
      return Number((distanceInMeters / 1000).toFixed(1));
    }
    console.warn("API returned non-OK status:", data);
    return null;
  } catch (error) {
    console.error("Error fetching distance:", error);
    return null;
  }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log("Fetching all conveyance records...");
  
  const { data: records, error } = await supabase
    .from('conveyance_records')
    .select('*');

  if (error) {
    console.error("Error fetching records:", error);
    process.exit(1);
  }

  console.log(`Found ${records.length} conveyance records.`);
  
  if (records.length === 0) {
      console.log("No records to process.");
      return;
  }

  let updatedCount = 0;
  let skippedCount = 0;

  for (const record of records) {
    if (!record.from_lat || !record.from_lng || !record.to_lat || !record.to_lng) {
      skippedCount++;
      continue;
    }

    console.log(`Processing record ${record.id} (Current dist: ${record.distance_km} km)`);
    
    // Call Google Maps API
    const actualDistance = await calculateRouteDistance(
      record.from_lat, record.from_lng,
      record.to_lat, record.to_lng
    );

    if (actualDistance !== null) {
      // Compare with stored distance. If they differ significantly (e.g. > 0.5km)
      if (Math.abs(actualDistance - record.distance_km) > 0.5) {
        console.log(`  -> Distance mismatch! Stored: ${record.distance_km} km, Actual: ${actualDistance} km`);
        
        const newAmount = Number((actualDistance * record.rate_per_km).toFixed(2));
        
        console.log(`     Updating record. New amount: ₹${newAmount}`);
        
        // Actually perform update 
        const { error: updateError } = await supabase
            .from('conveyance_records')
            .update({ distance_km: actualDistance, amount: newAmount })
            .eq('id', record.id);
            
        if (updateError) {
            console.error(`     Failed to update ${record.id}:`, updateError);
        } else {
            updatedCount++;
        }
      } else {
        console.log(`  -> Distance is accurate (${record.distance_km} km ≈ ${actualDistance} km)`);
        skippedCount++;
      }
    } else {
      console.log(`  -> Failed to calculate distance for ${record.id}`);
      skippedCount++;
    }

    // Rate limiting: sleep for 200ms between requests to avoid hitting Maps API quotas
    await delay(200);
  }

  console.log("\n--- Summary ---");
  console.log(`Total processed: ${records.length}`);
  console.log(`Successfully Updated: ${updatedCount}`);
  console.log(`Skipped: ${skippedCount}`);
}

main();
