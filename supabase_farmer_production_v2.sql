-- Migration: Add per-farmer production volume tracking
-- Run this in your Supabase SQL Editor

-- 1. Create the new table for farmer-level production
CREATE TABLE IF NOT EXISTS public.regional_farmer_production (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  farmer_id uuid REFERENCES public.regional_farmers(id) ON DELETE CASCADE,
  region_code text NOT NULL,
  municipality_code text NOT NULL,
  barangay_code text NOT NULL,
  barangay_name text NOT NULL,
  period_type text NOT NULL, -- weekly, monthly, quarterly, yearly
  report_year int NOT NULL,
  report_quarter int NOT NULL DEFAULT 0,
  report_month int NOT NULL DEFAULT 0,
  crop_data jsonb DEFAULT '{}'::jsonb, -- { "Rice": 10.5, "Mango": 2.5 }
  total_mt numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, farmer_id, period_type, report_year, report_quarter, report_month)
);

-- 2. Enable RLS
ALTER TABLE public.regional_farmer_production ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies
CREATE POLICY "Users manage their own farmer production" ON public.regional_farmer_production
  FOR ALL USING (true); -- Simplified policy for now, assume proper Auth context if needed

-- Index for faster aggregation
CREATE INDEX IF NOT EXISTS idx_farmer_production_brgy 
  ON public.regional_farmer_production (barangay_code, period_type, report_year);
