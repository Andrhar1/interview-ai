import {
  BarChart3,
  Code,
  GraduationCap,
  LayoutGrid,
  Megaphone,
  Users,
  type LucideIcon,
} from 'lucide-react';

const FIELD_ICONS: Record<string, LucideIcon> = {
  'teknologi-informasi': Code,
  pemasaran: Megaphone,
  keuangan: BarChart3,
  sdm: Users,
  pendidikan: GraduationCap,
  lainnya: LayoutGrid,
};

/** Icon for a job-field slug (Dashboard grid, History cards, detail headers). */
export function iconFor(slug: string): LucideIcon {
  return FIELD_ICONS[slug] ?? LayoutGrid;
}
