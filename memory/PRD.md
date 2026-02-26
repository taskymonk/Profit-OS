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

## Phase 2 (Planned)
- Live Shopify webhook integration
- India Post bulk tracking (auto RTO detection)
- Meta Ads daily spend sync
- Currency conversion via Exchange Rate API
- CSV import/export
- Employee daily output tracking
