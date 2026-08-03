const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: roles, error } = await supabase
    .from('user_roles')
    .select('*')
    .limit(20);
  if (error) {
    console.error('Error fetching roles:', error);
  } else {
    console.log('Sample User Roles in DB:', roles);
  }
}

run();
