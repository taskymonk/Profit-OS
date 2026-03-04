# Profit OS (True Profit Engine) - PRD

## Overview
A white-labeled SaaS application that calculates true profit per e-commerce order by factoring ALL costs: COGS, shipping (with RTO double-shipping), transaction fees, and marketing allocation.

## Tech Stack
- Next.js 14 (App Router)
- MongoDB (local/Atlas)
- Tailwind CSS + shadcn/ui
- Recharts for data visualization
- Sonner for notifications

## Core Features (Phase 1 - MVP)

### 1. True Profit Engine
**Formula per order:**
- Net Revenue = (Sales - Discount) - 18% GST
- COGS = Raw Materials + Packaging + Consumables + Wastage Buffer %
- Shipping = India Post tariff OR manual cost; **RTO = Shipping × 2**
- Transaction Fees = (Revenue × 2%) + 18% GST on fee
- Marketing = Daily Ad Spend ÷ Daily Orders
- **NET PROFIT = Net Revenue - COGS - Shipping - Txn Fees - Marketing**

### 2. Dashboard
- Live Net Profit (Today), RTO %, ROAS, Total Orders
- 7-Day Profit Trend (Area Chart)
- Daily Breakdown (Bar Chart - COGS, Shipping, Ads)
- Expandable order rows with full cost breakdown

### 3. SKU Recipe Management
- Define product recipes with raw materials + packaging
- Auto-calculate COGS per product
- Wastage buffer % applied automatically

### 4. Integrations Panel
- Shopify, India Post, Meta Ads, Exchange Rate API
- Credentials stored in MongoDB (not hardcoded)
- Active/Inactive toggles per integration

### 5. Tenant Config (White-Label)
- Business name, logo, primary color, theme
- Currency, timezone, GST rate
- Feature toggles

## API Endpoints
- POST /api/seed - Seed demo data
- GET /api/dashboard - Aggregated metrics
- GET /api/calculate-profit/{id} - Per-order profit
- CRUD: /api/orders, /api/sku-recipes, /api/raw-materials, /api/packaging-materials, /api/vendors, /api/employees, /api/overhead-expenses
- GET/PUT /api/integrations
- GET/PUT /api/tenant-config

## Phase 2 Features (Complete)

### 1. Date Range Picker (Dashboard)
- Today | Last 7 Days | This Month | All Time | Custom Range
- ALL metrics, charts, and tables re-calculate based on selected range
- GET /api/dashboard?range=today|7days|month|alltime|custom&startDate=&endDate=

### 2. Advanced Reports Page
- **Most Profitable SKUs**: Ranked by total profit with margin %, avg profit/order, RTO rates
- **Highest RTO Pincodes/Cities**: Location-based RTO analysis with bar chart
- **Employee Output vs Error Rate**: Performance comparison with daily averages

### 3. Urgent Order Override
- PUT /api/orders/{id}/urgent — Mark any order as urgent
- Select courier (BlueDart, DTDC, Delhivery, FedEx) + manual shipping cost
- Overrides India Post tariff in profit calculation
- Visual ⚡ badge on urgent orders

### 4. Employee Order Tagging
- **Claiming Station**: Employee selects name → types Order ID → claims it
- POST /api/employee-claim links orders to employees
- PUT /api/orders/{id}/assign for direct assignment
- Daily output tracking with exact order IDs per employee

### 5. Shopify Product & Order Sync
- POST /api/shopify/sync-products — Fetches all products/variants, auto-creates SKU recipes
- POST /api/shopify/sync-orders — Syncs historical orders with bundle handling
- Credentials fetched dynamically from DB (not hardcoded)

### 6. India Post Bulk Tracking
- POST /api/indiapost/track-bulk — Scans tracking events in chunks of 50
- Auto-updates order status to "Delivered" (event: Item Delivered) or "RTO" (event: Returned)
- Supports sandbox and production modes

### 7. Frankfurter.app Currency Conversion
- GET /api/currency?from=USD&to=INR&amount=100
- Free, no-auth, live rates from ECB
- 1-hour caching for performance
- Live USD/INR rate shown on dashboard


## Phase 3 Features (Complete)

### 1. Authentication & RBAC (Phase 1 of v3.0 Blueprint)
- **NextAuth.js** integration with JWT sessions (30-day expiry)
- **Email/Password authentication**: Registration + login with bcryptjs hashing
- **Google OAuth**: Credentials (Client ID/Secret) entered via Integration Panel
  - Dynamic credential loading from `integrations` collection
  - Setup guide with redirect URI in Integrations page
- **First user auto-promoted** to `master_admin` role
- **Role-Based Access Control (RBAC)**:
  | Role | Access |
  |------|--------|
  | Master Admin | Full access — all pages including Settings & Integrations |
  | Admin | Everything except Settings & Integrations |
  | Employee | Dashboard only (KDS in Phase 2 of v3.0) |
- **Login page** at `/login` with branded UI (tenant logo, theme)
- **Profile dropdown** in header (name, avatar, role badge, sign out)
- **User Management** in Settings page (role change, delete user)
- **Protected routes** — unauthenticated users redirected to `/login`
- **Sidebar filtering** — nav items hidden based on user role

### API Endpoints (Phase 3)
- GET /api/auth-config — Returns { googleConfigured: boolean }
- GET /api/auth/session — Returns current JWT session
- GET /api/users — List all users (passwordHash stripped)
- GET /api/users/{id} — Get specific user
- PUT /api/users/{id}/role — Change user role
- PUT /api/users/{id} — Update user name/avatar
- DELETE /api/users/{id} — Remove user
- PUT /api/integrations (google section) — Save Google OAuth credentials

### New Collections
- `users`: { _id (UUID), email, name, avatar, role, googleId, passwordHash, createdAt, updatedAt }
