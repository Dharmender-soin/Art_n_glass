const https = require('https');

const sql = [
  "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT",
  `CREATE TABLE IF NOT EXISTS public.conveyance_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_type TEXT NOT NULL UNIQUE,
    rate_per_km NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  "ALTER TABLE public.conveyance_settings ENABLE ROW LEVEL SECURITY",
  "INSERT INTO public.conveyance_settings (vehicle_type, rate_per_km) VALUES ('bike', 4), ('car', 8) ON CONFLICT (vehicle_type) DO NOTHING"
];

const SERVICE_KEY = 'sb_secret_sli3qU6nC-9_JU1E_T84og_IY1W8em4';
const HOST = 'khuqshdbpmuolyarhuud.supabase.co';

function runQuery(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const options = {
      hostname: HOST,
      port: 443,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Try direct pg via REST
async function main() {
  // Use the Supabase management API to run raw SQL via postgres endpoint
  for (const q of sql) {
    console.log('Running:', q.substring(0, 60) + '...');
    try {
      const r = await runQuery(q);
      console.log('  ->', r.status, r.body.substring(0, 100));
    } catch (e) {
      console.log('  Error:', e.message);
    }
  }
}

main();
