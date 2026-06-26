const url = 'https://khuqshdbpmuolyarhuud.supabase.co/functions/v1/send-push-notification';

async function testSend() {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'sb_publishable_Rs8MWYZC0DOgeqmcTc9pGg_VNCOqbCz',
        'Authorization': 'Bearer sb_secret_sli3qU6nC-9_JU1E_T84og_IY1W8em4'
      },
      body: JSON.stringify({
        userId: 'ddae4a8e-f31f-4a55-8801-f354b5ccfa6d',
        title: 'Test push notification',
        body: 'Hello! This is a test notification.'
      })
    });
    const data = await response.json();
    console.log('--- EDGE FUNCTION RESPONSE ---');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
}

testSend();
