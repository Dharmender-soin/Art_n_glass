# Live Map and Verification fix

## Supabase (manual step)

In **Art N Glass**, project ref `khuqshdbpmuolyarhuud`, open SQL Editor and run
`supabase/migrations/20260923110000_employee_names_and_tracking_access.sql` in full.
The script is transactional and can be rerun. It needs no Edge Function deployment.

It fills the creator display name on existing work items and maintains it on future
writes. Existing work-item access rules protect those names, including historical
authors whose profiles a manager can no longer read. It also adds a scoped name
lookup and manager attendance / MD location read policies. It does not recalculate
conveyance, change work statuses, or expand managers' access to full profiles.

## Website

Pushing `main` deploys the frontend through the existing Vercel integration.
Refresh the client panel after the SQL and frontend are deployed. Check Verification
under the affected manager account and confirm all author groups have names.
Live Map keeps names visible for live, stale and last-known positions.

## Employee tracking

Start Day now updates the same attendance cache that controls tracking. End Day is
checked before GPS starts. Returning to the app, reconnecting, and granting location
permission retry GPS. End Day/sign-out discards late callbacks and native watchers.
GPS age uses the sample time, so old coordinates are not labelled fresh.

Native Android apps bundle this code: rebuild/sync and install an updated APK to
receive the tracking changes. A Vercel deployment does not update installed APKs.
Browser tabs can be suspended when closed/minimized; a fresh GPS reading still
requires an active app and device permission/connectivity.

## Validation

- Frontend regression suite and production build.
- Isolated PostgreSQL test: `node supabase/tests/employee-access.test.mjs`
  (one-time dependency setup is documented at the top of that file).
- Production Admin inspection confirmed the reported 12/1/35-item groups belong
  to sandeep, Mr. PRAVESH KUMAR, and Mr. RAMESH JHA. Manager verification requires
  the database step above.
