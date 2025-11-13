-- Critical Performance Indexes Migration
-- These indexes optimize the most frequently executed queries

-- Booking table indexes for aggregation queries (used in generateAlerts)
-- Composite index on destination + size for groupBy operations
CREATE INDEX IF NOT EXISTS "Booking_destination_size_idx" ON "public"."Booking"("destination", "size");

-- Composite index for filtering by destination, size, and date
CREATE INDEX IF NOT EXISTS "Booking_destination_size_date_idx" ON "public"."Booking"("destination", "size", "date" DESC);

-- Proposal table indexes for filtering by status
-- Composite index on status + createdAt for efficient filtering of draft/pending proposals
CREATE INDEX IF NOT EXISTS "Proposal_status_createdAt_idx" ON "public"."Proposal"("status", "createdAt" DESC);

-- Alert table index for filtering active alerts by creation date
-- Already exists from previous migration, but ensuring it's optimal
CREATE INDEX IF NOT EXISTS "Alert_status_createdAt_idx" ON "public"."Alert"("status", "createdAt" DESC);

-- Inventory table index for efficient lookups by port and type
-- Composite index for the most common query pattern
CREATE INDEX IF NOT EXISTS "Inventory_port_type_stock_idx" ON "public"."Inventory"("port", "type", "stock");

-- COMMENT: These indexes specifically target the N+1 queries we just fixed
-- The composite indexes allow PostgreSQL to use "index-only scans" for better performance
