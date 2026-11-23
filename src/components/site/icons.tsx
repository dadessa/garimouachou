import { Box, Cpu, Gift, Grid2x2, House, Shirt, Sparkles, type LucideIcon } from "lucide-react";
import type { CategoryIcon } from "@/lib/catalog/types";

const map: Record<CategoryIcon, LucideIcon> = { home: House, cpu: Cpu, shirt: Shirt, sparkles: Sparkles, box: Box, gift: Gift, grid: Grid2x2 };
export function CatIcon({ icon, className }: { icon: CategoryIcon; className?: string }) {
  const I = map[icon] ?? Grid2x2;
  return <I className={className} strokeWidth={2.2} strokeLinecap="round" aria-hidden />;
}
