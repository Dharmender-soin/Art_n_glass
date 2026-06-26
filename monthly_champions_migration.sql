-- ══════════════════════════════════════════════════════
-- Monthly Champions Table
-- Stores top performers per month per category
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS monthly_champions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  month       TEXT        NOT NULL,        -- "2026-06"
  category    TEXT        NOT NULL,        -- "visits" | "clients" | "orders_won"
  user_id     UUID        REFERENCES profiles(user_id) ON DELETE SET NULL,
  full_name   TEXT        NOT NULL,
  role        TEXT,                        -- "executive" | "tl" | "manager"
  showroom_id UUID        REFERENCES showrooms(id) ON DELETE SET NULL,
  showroom_name TEXT,
  score       INTEGER     NOT NULL DEFAULT 0,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (month, category, user_id)
);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_monthly_champions_month ON monthly_champions(month DESC);
CREATE INDEX IF NOT EXISTS idx_monthly_champions_category ON monthly_champions(category);

-- ── Row Level Security ──
ALTER TABLE monthly_champions ENABLE ROW LEVEL SECURITY;

-- Everyone (authenticated) can read
CREATE POLICY "Champions are readable by all authenticated users"
  ON monthly_champions FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only MD / Admin profiles can insert/update/delete
CREATE POLICY "Only MD or Admin can manage champions"
  ON monthly_champions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid()
        AND role IN ('md', 'admin')
    )
  );

-- ══════════════════════════════════════════════════════
-- Seed last month's champion (example — replace values)
-- ══════════════════════════════════════════════════════
-- INSERT INTO monthly_champions (month, category, full_name, role, score)
-- VALUES ('2026-05', 'visits', 'Rahul Sharma', 'executive', 112);
