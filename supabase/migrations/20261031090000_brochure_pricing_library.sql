-- REVIEW ONLY: this migration is deliberately not applied by the application.
-- Published snapshots are separate from quotation/CRM history and expose no supplier-cost fields.
CREATE TABLE IF NOT EXISTS public.brochure_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brochure_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('Draft', 'Ready for Review', 'Published', 'Archived')),
  programme_id text NOT NULL,
  programme_code text,
  name text NOT NULL,
  validity_from date NOT NULL,
  validity_till date NOT NULL CHECK (validity_till >= validity_from),
  source_quote_id text NOT NULL,
  source_quote_hash text,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (brochure_id, version)
);

CREATE TABLE IF NOT EXISTS public.brochure_published_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brochure_version_id uuid NOT NULL REFERENCES public.brochure_versions(id) ON DELETE RESTRICT,
  programme_id text NOT NULL,
  pax integer NOT NULL CHECK (pax > 0),
  hotel_category text NOT NULL,
  accommodation_option_id text NOT NULL,
  transport_variation_id text,
  transport_description text NOT NULL,
  occupancy text NOT NULL,
  validity_from date NOT NULL,
  validity_till date NOT NULL,
  price_per_person numeric(14,2) NOT NULL CHECK (price_per_person > 0),
  group_total numeric(14,2) NOT NULL CHECK (group_total > 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  UNIQUE (brochure_version_id, pax, accommodation_option_id, transport_variation_id, occupancy)
);

CREATE INDEX IF NOT EXISTS brochure_published_prices_exact_lookup_idx
  ON public.brochure_published_prices (programme_id, pax, hotel_category, transport_variation_id, occupancy, validity_from, validity_till);

ALTER TABLE public.brochure_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brochure_published_prices ENABLE ROW LEVEL SECURITY;
-- Add organisation-specific staff and portal policies during review. Do not grant anonymous
-- access to brochure_versions: it contains internal snapshot audit metadata.
