-- Migration: Remove deprecated fields
-- This aligns the database schema with the code after commit 71b8d66
-- "Remove coverage days and gap fields to simplify allocation"

-- Remove coverage_days from allocations table
ALTER TABLE public.allocations
DROP COLUMN IF EXISTS coverage_days;

-- Remove target_units and gap from allocation_items table
ALTER TABLE public.allocation_items
DROP COLUMN IF EXISTS target_units;

ALTER TABLE public.allocation_items
DROP COLUMN IF EXISTS gap;

-- Add comments for tracking
COMMENT ON TABLE public.allocations IS 'Allocation records - updated schema to remove deprecated coverage_days field';
COMMENT ON TABLE public.allocation_items IS 'Allocation items - updated schema to remove deprecated target_units and gap fields';
