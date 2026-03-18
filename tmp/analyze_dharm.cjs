// Using node-fetch with the Supabase service role key (newer sb_secret format)
const https = require('https');

const BASE = 'khuqshdbpmuolyarhuud.supabase.co';
const SERVICE_KEY = 'sb_secret_sli3qU6nC-9_JU1E_T84og_IY1W8em4';
const today = '2026-03-18';

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: BASE,
      path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('=== PROFILES ===');
  const profiles = await apiGet('/rest/v1/profiles?select=user_id,full_name,conveyance_type,conveyance_rate');
  if (Array.isArray(profiles)) profiles.forEach(p => console.log(' ', p.full_name, p.user_id, p.conveyance_type, p.conveyance_rate));
  else console.log(JSON.stringify(profiles));

  console.log('\n=== DAILY ATTENDANCE TODAY ===');
  const att = await apiGet(`/rest/v1/daily_attendance?date=eq.${today}&select=user_id,check_in_lat,check_in_lng,created_at`);
  if (Array.isArray(att)) att.forEach(a => {
    const name = Array.isArray(profiles) ? (profiles.find(p => p.user_id === a.user_id)?.full_name || a.user_id) : a.user_id;
    console.log(`  ${name}: GPS ${a.check_in_lat}, ${a.check_in_lng} | Time: ${a.created_at}`);
  });
  else console.log(JSON.stringify(att));

  console.log('\n=== CONVEYANCE RECORDS TODAY ===');
  const conv = await apiGet(`/rest/v1/conveyance_records?date=eq.${today}&select=user_id,from_location_name,from_lat,from_lng,to_location_name,to_lat,to_lng,distance_km,amount,vehicle_type,visit_id,created_at&order=created_at`);
  if (Array.isArray(conv)) {
    let totalKm = 0, totalAmt = 0;
    conv.forEach((c, i) => {
      const name = Array.isArray(profiles) ? (profiles.find(p => p.user_id === c.user_id)?.full_name || c.user_id) : c.user_id;
      console.log(`\n  [${i+1}] ${name}`);
      console.log(`  From: ${c.from_location_name} (${c.from_lat}, ${c.from_lng})`);
      console.log(`  To  : ${c.to_location_name} (${c.to_lat}, ${c.to_lng})`);
      console.log(`  Dist: ${c.distance_km} km | Rs ${c.amount} | ${c.vehicle_type}`);
      console.log(`  Type: ${c.visit_id ? 'Visit Trip' : 'END OF DAY'}`);
      totalKm += Number(c.distance_km || 0); totalAmt += Number(c.amount || 0);
    });
    console.log(`\n  TOTAL: ${totalKm.toFixed(2)} km | Rs ${totalAmt.toFixed(2)}`);
    console.log(`  COUNT: ${conv.length} trips`);
  } else console.log(JSON.stringify(conv));

  console.log('\n=== VISITS TODAY ===');
  const visits = await apiGet(`/rest/v1/visits?visit_date=eq.${today}&select=created_by,status,address,check_in_at,check_in_lat,check_in_lng,done_at,gps_latitude,gps_longitude&order=done_at`);
  if (Array.isArray(visits)) visits.forEach((v, i) => {
    const name = Array.isArray(profiles) ? (profiles.find(p => p.user_id === v.created_by)?.full_name || v.created_by) : v.created_by;
    console.log(`\n  [${i+1}] ${name} | Status: ${v.status}`);
    console.log(`  Addr: ${v.address}`);
    console.log(`  CheckIn: ${v.check_in_at || 'NOT SET'} @ (${v.check_in_lat}, ${v.check_in_lng})`);
    console.log(`  Done:    ${v.done_at || 'NOT SET'} @ (${v.gps_latitude}, ${v.gps_longitude})`);
  });
  else console.log(JSON.stringify(visits));

  console.log('\n=== LOCATION HISTORY TODAY ===');
  const lh = await apiGet(`/rest/v1/location_history?timestamp=gte.${today}T00:00:00Z&timestamp=lte.${today}T23:59:59Z&select=user_id,timestamp&order=timestamp`);
  if (Array.isArray(lh)) console.log(`  ${lh.length} GPS pings recorded`);
  else console.log(JSON.stringify(lh));
}

main().catch(e => console.error('ERR:', e.message));
