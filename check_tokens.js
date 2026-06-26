import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://khuqshdbpmuolyarhuud.supabase.co';
const supabaseKey = 'sb_secret_sli3qU6nC-9_JU1E_T84og_IY1W8em4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTokens() {
  const { data, error } = await supabase
    .from('user_fcm_tokens')
    .select('*');
  
  if (error) {
    console.error('Error fetching tokens:', error);
    return;
  }
  
  console.log('--- FCM TOKENS IN DATABASE ---');
  console.log(JSON.stringify(data, null, 2));
}

checkTokens();
