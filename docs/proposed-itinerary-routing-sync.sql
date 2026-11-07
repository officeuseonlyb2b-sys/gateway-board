-- REVIEW ONLY — DO NOT EXECUTE OR PLACE UNDER supabase/migrations.
--
-- Purpose: make only explicitly saved, complete Itinerary Master routings
-- available to authenticated CRM browsers. This is not a legacy Programme
-- Master import and must be approved, versioned, and applied separately.
--
-- Depends on the existing public.is_linked_costing_master_reader() and
-- public.is_linked_super_admin() functions. Confirm their deployed ownership,
-- grants and active-employee semantics before promoting this proposal.

CREATE TABLE public.crm_itinerary_routings (
  itinerary_id text PRIMARY KEY,
  programme_id text NOT NULL UNIQUE,
  programme_code text NOT NULL,
  programme_name text NOT NULL,
  routing_fingerprint text NOT NULL,
  nights integer NOT NULL CHECK (nights >= 1),
  days_count integer NOT NULL CHECK (days_count = nights + 1),
  start_city text NOT NULL,
  end_city text NOT NULL,
  routing jsonb NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('quotation', 'manual')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX crm_itinerary_routings_programme_fingerprint_unique
  ON public.crm_itinerary_routings (programme_id, routing_fingerprint);
CREATE INDEX crm_itinerary_routings_active_lookup_idx
  ON public.crm_itinerary_routings (status, nights, programme_code);

ALTER TABLE public.crm_itinerary_routings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.crm_itinerary_routings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crm_itinerary_routings TO authenticated;
GRANT ALL ON TABLE public.crm_itinerary_routings TO service_role;

-- Active linked CRM readers may see only active explicitly synced routings.
CREATE POLICY crm_itinerary_routings_read_active
  ON public.crm_itinerary_routings FOR SELECT TO authenticated
  USING (status = 'active' AND public.is_linked_costing_master_reader());

-- Synchronization is an explicit Super Admin action. The application must
-- validate snapshot completeness and fingerprint client-side, then show any
-- failed write to the operator; it must never bulk-copy IndexedDB records.
CREATE POLICY crm_itinerary_routings_admin_write
  ON public.crm_itinerary_routings FOR ALL TO authenticated
  USING (public.is_linked_super_admin())
  WITH CHECK (public.is_linked_super_admin());

-- Review additions required before execution:
-- 1. A BEFORE UPDATE trigger setting updated_at and protecting programme_id /
--    itinerary_id from mutation, or a SECURITY DEFINER RPC that permits only
--    validated upserts by itinerary_id.
-- 2. An RPC/API that validates routing JSON (consecutive days, correct
--    overnight count, nonblank endpoints) and recomputes/compares the routing
--    fingerprint server-side before an upsert.
-- 3. A client adapter that explicitly offers “Sync this saved routing”, reads
--    only active rows, and reports every authentication/network/validation
--    failure. No automatic local IndexedDB import is permitted.

-- Required RPC implementation after review: it must be SECURITY DEFINER,
-- require is_linked_super_admin(), validate every JSON routing row and
-- recompute the routing fingerprint server-side. It must lock by both
-- itinerary_id and programme_id; reject identity/fingerprint conflicts and
-- stale expected_fingerprint values; and set created_by/updated_by from
-- auth.uid(). Grant EXECUTE only to authenticated. Do not permit direct
-- INSERT/UPDATE from the browser, even to a Super Admin.
