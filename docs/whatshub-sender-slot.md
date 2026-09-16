# WhatsHub sending number

The app previously sent every WhatsHub request with `slot: 1`. An admin can now
save Number 1 or Number 2 under **Notification Settings → Integrations → WhatsApp
Sending Number**. The saved choice is used for integration tests, showroom group
messages, staff phone messages and scheduled reports. The selected number must
already be connected in WhatsHub; this control does not connect a phone.

## Deployment order

Target Supabase project: `khuqshdbpmuolyarhuud`.

1. Apply `supabase/migrations/20260916010000_whatshub_sender_slot.sql` in this
   project's SQL Editor. It preserves Number 1 for an existing installation.
   Reapplying it preserves the admin's saved choice.
2. Deploy the complete `supabase/functions/whatshub` function, including
   `sender.ts`, `reports.ts` and `test-target.ts`. Preserve the existing custom
   user/cron authentication setup (`verify_jwt = false`). The handler validates
   user sessions or the stored cron secret itself.
3. Deploy the frontend. Sign in as admin, select **Number 2 (Slot 2)** and click
   **Save Sending Number**. Reopen the settings and confirm **Currently saved:
   Number 2**.

Apply the database migration before deploying the function. If the saved slot
cannot be read, delivery fails with a configuration error instead of sending
from a different number. Number 1 being offline is not a reason to switch an
explicit selection automatically.

The setter RPC is admin-only. The getter is available only to admins and the
backend service role. Direct table access is blocked for app users.

## Checks

`npm test` covers both slots for phone/group payloads, persisted admin selection,
role restrictions, failed reads/saves and provider rejection. These tests mock
the provider and do not send WhatsApp messages.

After deployment, an authorized test to an approved destination can verify
provider acceptance and receipt from the selected WhatsApp number. A frontend
build or a successful mocked test does not verify live message delivery.

For the Supabase dashboard editor, a single-file function bundle can be generated:

```powershell
npx --no-install esbuild supabase/functions/whatshub/index.ts --bundle --format=esm --platform=neutral '--external:https://*' --outfile=output/whatshub-slot-deploy/index.ts
```

Use that complete bundle as the function's `index.ts`; it includes the local
helpers. It contains no API keys or cron secrets.
