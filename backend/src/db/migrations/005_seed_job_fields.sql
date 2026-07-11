-- Fase 2: seed job_fields table (6 job fields from Dashboard step 1)

INSERT INTO job_fields (slug, name, description, sort_order)
VALUES
  ('teknologi-informasi', 'Teknologi Informasi', 'Software, data, infrastruktur', 1),
  ('pemasaran', 'Pemasaran', 'Brand, digital, pertumbuhan', 2),
  ('keuangan', 'Keuangan', 'Akuntansi, analis, audit', 3),
  ('sdm', 'SDM', 'Rekrutmen, people ops', 4),
  ('pendidikan', 'Pendidikan', 'Pengajar, kurikulum', 5),
  ('lainnya', 'Lainnya', 'Bidang lain di luar daftar', 6)
ON CONFLICT (slug) DO NOTHING;
