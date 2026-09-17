# Daily Planned Visits: Executive, Team Leader and Manager

The daily planning report includes active `executive`, `tl` and `manager` roles
assigned to the selected showroom. Each employee appears once even with multiple
eligible role rows. Employees with no visits appear with `No planned visits`.
Cancelled visits do not contribute to the total.

The same report loader serves previews, manual planning sends and the daily
10:30 AM IST scheduler. Plans created after the scheduled report was generated
appear in a later preview; they cannot change a WhatsApp message already sent.

This change is scoped to Daily Planned Visits. Other report types retain their
existing participant scope. WhatsHub destinations, the saved sending number and
report schedules remain configured as before.

## Deployment

No new database migration is needed. In the Art N Glass Supabase project
`khuqshdbpmuolyarhuud`, deploy the updated `whatshub` Edge Function. To prepare
a single file for the dashboard Code editor:

```powershell
npx --no-install esbuild supabase/functions/whatshub/index.ts --bundle --format=esm --platform=neutral '--external:https://*' --outfile=output/whatshub-planning-roles/index.ts
```

Replace the function's entire `index.ts` with this bundle and deploy updates.
Keep the existing custom authentication configuration. The bundle contains all
local helpers and uses existing environment/Vault credentials.

After deployment, open Notification Settings → Delivery, select a showroom and
click **Preview 10:30 Summary**. Check that its active Executives, Team Leaders
and Managers appear, including staff with no visits. Preview does not send a
WhatsApp message. Source pushes to GitHub/Vercel do not deploy this Edge Function.

The regression tests exercise mixed-role staff, inactive staff, other showrooms,
multiple role assignments, zero plans, cancelled visits and database failures.
