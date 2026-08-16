# Art-N-Glass Professional UI/UX Redesign & Responsive Optimization Plan

This plan covers a staged redesign of the production Art-N-Glass application across desktop, tablet, mobile web, and Android. It separates safe frontend work from backend, schema, and production-security work that requires explicit approval.

## 1. Production Safety and Change Control

### Phase A: Safe local frontend work

- Preserve existing authentication, roles, Supabase queries, calculations, routes, GPS tracking, notifications, and business workflows.
- Make incremental local changes to React components, CSS tokens, layout primitives, and reviewed Android static assets.
- Do not send test notifications, modify production records, run database migrations, deploy Edge Functions, publish an APK, or deploy the web app without explicit approval.
- Inspect the current worktree before every implementation phase and preserve unrelated user changes.
- Use test/dummy accounts for interactive QA wherever possible.
- Keep frontend redesign changes separate from backend fixes so they can be reviewed and reverted independently.

### Phase B: Approval-required work

The following are not included in a frontend-only redesign and require a reviewed migration or deployment plan:

- Notification-table schema reconciliation.
- Edge Function authorization changes.
- New GPS accuracy, speed, bearing, battery, or vehicle fields.
- RLS policy changes.
- Production WebView security changes.
- FCM configuration, cron changes, production deployment, and Play Store publishing.

## 2. Confirmed Risks to Keep Separate from UI Work

1. `sendNotification` currently attempts extended notification fields and falls back to core fields when the live schema rejects columns such as `category`. The fallback prevents some failures but loses category, priority, metadata, and deep-link fidelity. It is not a complete schema fix.
2. `useAuth.tsx` reads `reports_to`, but its current role query selects only `role, showroom_id`. The field must be selected before it can populate the hierarchy value reliably.
3. `NotificationSettings.tsx` has early returns before several hooks and must be reorganized so hooks execute unconditionally.
4. Dashboard markup contains a block-rendering Badge inside a paragraph, producing a DOM nesting warning.
5. The push Edge Function accepts user, showroom, role, and broadcast targets without performing an explicit caller-role authorization check inside the function.
6. Client-side scheduled notifications overlap with server-side cron/queue behavior and can create missed or duplicate sends.
7. `allowMixedContent` and `webContentsDebuggingEnabled` are currently enabled in Capacitor configuration. Production-safe values should be implemented only after confirming the release build workflow.

## 3. Responsive Design System

- Retain the Art-N-Glass crimson identity while standardizing light and dark theme tokens.
- Define consistent typography, spacing, card padding, radius, border, shadow, and icon rules.
- Use a minimum 44x44 px interactive target on touch devices.
- Add safe-area utilities for Android/iOS top and bottom insets.
- Add reusable scrollbar-hidden horizontal scrollers with visible keyboard focus and accessible overflow behavior.
- Respect `prefers-reduced-motion`.
- Avoid forcing detailed wordmark artwork into tiny icon containers; use a simplified brand mark where necessary.

## 4. App Shell, Header, Sidebar, and Mobile Navigation

### App layout

- Replace inconsistent `Property OS` fallback branding with `Art N Glass` or the correct page title.
- Simplify the mobile header and keep the page title readable.
- Prioritize Quick Add and Notifications; place secondary actions in an overflow/profile menu when space is limited.
- Prevent accidental page-level horizontal overflow without hiding legitimate table, chart, filter, or map scrollers.

### Sidebar

- Correct `Verification font-bold` to `Verification`.
- Standardize Lucide icon size, stroke, alignment, tooltip, and active state.
- Preserve role-based route visibility.

### Bottom navigation

- Show no more than five total bottom-bar destinations, including `More`.
- For Admin/MD, recommended primary destinations are `Command`, `Clients`, `Visits`, `Reports`, and `More`.
- Move Partners, Profile, Home, Hierarchy, Daily Visits, Partner Visits, Conveyance, Verification, Live Map, Notifications, and User Management into a role-aware More sheet as appropriate.
- Use readable 10-11 px labels, sufficient inactive-state contrast, 44 px targets, and safe-area padding.
- Validate every role separately: MD, Admin, Manager, TL, Accountant, Executive, and Backhand Executive.

## 5. Dashboard and Core Page Improvements

- Use compact two-column mobile KPI grids and balanced desktop grids.
- Keep only the most important summary card full-width.
- Place secondary analytics behind tabs, accordions, or progressive disclosure to reduce excessive vertical scrolling.
- Convert shortcut and filter groups into accessible swipeable rows without visible ugly scrollbars.
- Prevent headings, badges, filters, cards, legends, and actions from clipping.
- Review unusually large percentage changes separately; do not alter calculation formulas as part of visual redesign.
- Make charts responsive with readable axes, legends, and tooltips.
- Present large tables as mobile cards or explicit contained table scrollers.
- Constrain modals, drawers, dropdowns, search results, and AI chat to the viewport.

Pages to verify include Dashboard, Command Center, Partners, Clients, Visits, Reports, Profile, Daily Visits, Verification, Hierarchy, Live Map, Conveyance, Partner Visits, My Pipeline, Notifications, Notification Settings, User Management, Global Search, Quick Add, AI Assistant, loading states, empty states, errors, and access-denied states.

## 6. Live Map and Vehicle-Aware Tracking

### Phase A: Frontend-only improvements (no schema mutation)

- Enrich live-location records with the user's existing profile `conveyance_type` where available.
- Display vehicle-aware markers based on stored data:
  - Car: car marker.
  - Bike/motorcycle: bike marker.
  - Pooled travel: shared-ride marker when an active visit provides that context.
  - Missing/unknown vehicle: neutral person/navigation marker; never guess a vehicle.
- Use clear freshness states:
  - Green: recent update.
  - Amber: stale update.
  - Grey: offline/last known location.
- Replace bouncing generic markers with stable, accessible markers and a subtle selected state.
- Add a compact marker detail card containing employee name, vehicle type, showroom, resolved address, last update time, tracking status, current visit when available, and actions for Follow, Route, and Open in Google Maps.
- Add employee, showroom, online status, and vehicle filters.
- Add marker clustering for overlapping users.
- Add an explicit `Last known location` label for stale records.
- Provide full-screen mobile map mode with a collapsible employee sheet.
- Keep the existing road-snapped route and visually distinguish it from the actual GPS breadcrumb trail.
- Ensure map controls, bottom navigation, employee sheet, and AI button do not overlap.
- Preserve manager/showroom data restrictions and existing RLS behavior.

### Phase B: Accuracy and motion telemetry (requires explicit schema approval)

The current `live_locations` and `location_history` records store latitude, longitude, and time, while the device callback also provides accuracy, speed, and bearing. A reviewed migration can add:

- `accuracy_m`
- `speed_mps`
- `bearing_deg`
- `provider`
- `battery_level` and `is_charging` if supported and approved
- `vehicle_type` snapshot only if a reliable source-of-truth strategy is agreed

After approval, the UI can show:

- GPS accuracy circle and `± metres` value.
- Marker rotation based on bearing.
- Speed in km/h.
- Smooth interpolation between valid updates.
- Weak-GPS and impossible-jump warnings.
- Tracking-health information without claiming false precision.

GPS cannot be guaranteed to be perfectly exact. Accuracy depends on device hardware, permissions, indoor/outdoor conditions, network state, Android battery optimization, and update frequency. The UI must display measured accuracy rather than imply exactness.

### Tracking reliability review

- Review the current 30-metre native distance filter and 60-second web interval against battery and operational requirements.
- Persist location only after validating coordinates, accuracy thresholds, timestamps, and unrealistic jumps.
- Define online/stale/offline thresholds centrally instead of using inconsistent 5-minute and 15-minute checks.
- Document Android background-location permission and battery-optimization setup for field staff.
- Add retention and privacy rules for location history before collecting additional telemetry.

## 7. Android Branding

- Replace the current green-grid launcher asset with a professional adaptive icon using a simplified Art-N-Glass mark.
- Do not place the full wordmark or tagline in a small launcher icon.
- Create foreground, background, round, and monochrome adaptive-icon variants and verify safe-zone cropping.
- Replace the default Capacitor splash artwork with an approved Art-N-Glass splash.
- Add a dedicated white-on-transparent Android status-bar notification icon.
- Preserve the existing published package ID unless release ownership confirms that it may change.

## 8. Accessibility and Quality

- Use semantic heading hierarchy and valid HTML nesting.
- Provide labels for icon-only controls and visible keyboard focus.
- Do not communicate status using color alone.
- Verify text and icon contrast in both themes.
- Associate form labels and errors correctly.
- Verify touch, keyboard, screen-reader names, and reduced motion on modified components.

## 9. Verification Workflow

1. Capture baseline screenshots and console logs for each accessible role/route.
2. Implement the design system and app shell first.
3. Update dashboard and navigation as the reference pattern.
4. Improve remaining routes incrementally.
5. Implement Live Map Phase A independently from database changes.
6. Review Android assets separately.
7. Run checks after each phase.

### Automated checks

- `npx tsc -p tsconfig.app.json --noEmit`
- `npm run build`
- `npm test`
- ESLint on modified source files
- `npx cap sync android` only after reviewed web changes
- `gradlew.bat assembleDebug` for a local debug APK

The repository currently has pre-existing TypeScript and lint failures. The implementation must not claim a zero-error baseline until those are resolved, and it must not introduce new errors in modified files.

### Responsive viewports

- Mobile: 320, 360, 390, and 430 px.
- Tablet: 768 and 1024 px.
- Desktop: 1280, 1440, and 1920 px.
- Verify light and dark themes.
- Verify portrait and landscape where maps, charts, or tables are involved.

### Completion evidence

- List every changed file.
- Provide before/after screenshots.
- Report build, test, type-check, lint, and Android build results independently.
- List every unverified route or role instead of guessing.
- List all backend/schema/security recommendations separately.
- Do not deploy, migrate, send test notifications, or publish without explicit approval.

