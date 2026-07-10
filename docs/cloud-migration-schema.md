# Cloud Migration Schema Notes

This repository now includes an initial Supabase schema at:

`supabase/migrations/20260709000000_initial_cloud_schema.sql`

## Data Safety Rule

The July 3 backup is a schema reference only. It should not be treated as the final production dataset.

The final production import source must be a fresh full backup created from the shop PC at cutover time, after the POS is paused or closed on all active machines.

## Current Schema Coverage

The schema covers the local backup collections:

- technicians
- timeEntries
- customers
- workOrders
- sales
- calendarEvents
- deviceCategories
- productCategories
- products
- partSources
- repairCategories
- repairItems
- intakeSources
- suppliers
- vendors
- invoices
- payments
- settings
- preferences
- userProfiles through Supabase Auth plus staff_profiles
- systemLogs

## Sensitive Fields

The local backup includes sensitive fields that should be handled deliberately during import:

- technician passcodes
- work order device passwords

The schema isolates those values into private credential tables instead of placing them directly on primary business records.

## Import Strategy

Use `legacy_id` columns to preserve relationships from the local backup while allowing Supabase to use UUID primary keys. The import process should:

1. Create or select the shop row.
2. Import staff, customers, products, categories, work orders, sales, and calendar records.
3. Resolve relationships from legacy IDs to UUIDs.
4. Store sensitive credentials separately.
5. Compare imported counts against the fresh cutover backup before switching the app to cloud mode.

