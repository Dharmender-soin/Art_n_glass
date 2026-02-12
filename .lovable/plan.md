

# Sales CRM + Visit Management Web App

## Overview
A professional, corporate-styled Sales CRM for a building materials & architectural sales company. Mobile-first for field executives, desktop dashboard for managers/admins. Powered by Supabase (Auth, Database, Storage).

---

## Phase 1: Foundation & Auth

### Authentication
- Email + Password login with Supabase Auth
- Role-based access: Admin, Manager, Sales/Marketing Executive
- Roles stored in a separate `user_roles` table (secure, no privilege escalation)
- Executives see only their own data; Manager/Admin see all

### UI Layout
- **Corporate Professional** design: Dark sidebar, formal look, enterprise feel
- Mobile: Bottom navigation bar for executives (Partners, Clients, Visits, Profile)
- Desktop: Sidebar navigation with collapsible menu for Manager/Admin dashboard

---

## Phase 2: Builder/Architect (Partner) Management

- Register Builder or Architect with fields: Type, Name, Mobile, Company, Address, City
- After saving → immediately show "Create Lead/Client" form on same screen
- List view with search and filter by city/type
- Executive sees only their partners; Manager sees all

---

## Phase 3: Lead/Client Management

- Each client linked to a Builder/Architect (Lead Source)
- Fields: Client Name, Mobile, Address, City, Lead Source, Notes, Status (New/Hot/Converted/Lost)
- Status badges with color coding
- Filter by status, city, partner
- Quick-add from partner detail screen

---

## Phase 4: Work Scope Management

- Master Work Types table pre-loaded with the 11 work scope items (uPVC, Aluminium, Skylight, Glass Railing, Aarna, Showers, Mirrors, Decorative Glass)
- Each client can have multiple work scope items
- Dropdown for Work Type → Sub Work auto-fills from master
- Optional quantity and description/notes
- Auto-calculated total work scope count per client displayed on client card

---

## Phase 5: Visit Planner & Execution

### Planning
- Plan visits for Client OR Builder/Architect
- Fields: Visit Date, Visit With Type, Select Client/Partner (with address auto-fill), Purpose
- Status: Planned / Done / Cancelled

### Visit Done Logic
- Executive can mark "Done" only if visit date = today (Manager can override)
- On marking Done: capture browser GPS location, timestamp, mandatory remarks, optional single photo upload (stored in Supabase Storage)

---

## Phase 6: Reports & Dashboard

### Executive Reports
- Filter by date range, status, visit type
- Show: Total planned, total done, unique clients visited, unique partners visited
- List view with date, name, purpose, status

### Manager Dashboard
- Executive-wise performance cards
- Planned vs Done visit comparison
- Leads by partner breakdown
- Work scope summary across clients
- Date filters for all views

---

## Database Structure (Supabase/PostgreSQL)
- `users` (via Supabase Auth)
- `user_roles` (role enum: admin, manager, executive)
- `partners` (builders/architects)
- `clients` (linked to partners)
- `master_work_types` (11 pre-loaded items)
- `work_scope_items` (linked to clients)
- `visits` (with GPS, photo URL, remarks)
- All tables with UUID primary keys, RLS policies, and created_by/created_at fields

