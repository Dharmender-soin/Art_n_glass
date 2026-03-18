/*
 * Bulk update script: Re-calculates distance_km and amount for all conveyance_records
 * using Google Maps Distance Matrix API (actual road distance).
 */

const SUPABASE_URL = "https://khuqshdbpmuolyarhuud.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = ""; // <-- Paste your service role key here
const GOOGLE_MAPS_API_KEY = "AIzaSyBIrluiF9C2_nyAIPAnHSRXpLx-X3UIRgg";

const HEADERS = {
  "apikey": SUPABASE_SERVICE_ROLE_KEY,
  "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function getRouteDistanceKm(fromLat, fromLng, toLat, toLng) {
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${fromLat},${fromLng}&destinations=${toLat},${toLng}&key=${GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === "OK" && data.rows[0].elements[0].status === "OK") {
    const meters = data.rows[0].elements[0].distance.value;
    return Number((meters / 1000).toFixed(1));
  }
  return null; // fallback: skip this record
}

async function main() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Please fill in SUPABASE_SERVICE_ROLE_KEY before running this script.");
    process.exit(1);
  }

  // 1. Fetch all conveyance records that have coordinates
  console.log("📥 Fetching all conveyance records...");
  const fetchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/conveyance_records?select=id,from_lat,from_lng,to_lat,to_lng,distance_km,rate_per_km,amount&from_lat=not.is.null&to_lat=not.is.null`,
    { headers: HEADERS }
  );
  const records = await fetchRes.json();
  console.log(`✅ Found ${records.length} records to process.\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  // 2. Process each record
  for (const record of records) {
    const { id, from_lat, from_lng, to_lat, to_lng, rate_per_km } = record;

    // Get real road distance from Google Maps
    const newDistance = await getRouteDistanceKm(from_lat, from_lng, to_lat, to_lng);

    if (newDistance === null) {
      console.warn(`⚠️  Skipped record ${id} — Google Maps returned no result.`);
      skipped++;
      continue;
    }

    const newAmount = Number((newDistance * (rate_per_km || 0)).toFixed(2));

    // 3. Patch the record
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/conveyance_records?id=eq.${id}`,
      {
        method: "PATCH",
        headers: HEADERS,
        body: JSON.stringify({ distance_km: newDistance, amount: newAmount }),
      }
    );

    if (patchRes.ok) {
      console.log(`✅ Updated ${id}: ${record.distance_km} km → ${newDistance} km | ₹${record.amount} → ₹${newAmount}`);
      updated++;
    } else {
      const err = await patchRes.text();
      console.error(`❌ Failed to update ${id}: ${err}`);
      failed++;
    }

    // Small delay to avoid exceeding Google API rate limits
    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`\n🏁 Done! Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);
}

main().catch(console.error);
