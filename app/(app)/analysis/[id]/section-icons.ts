import {
  CalendarClock,
  CalendarDays,
  FileText,
  GraduationCap,
  ListChecks,
  MessageSquareText,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { SectionSlug } from "@/lib/domain/analysis-nav";

/** One icon per section, shared by the tab cards, the dock and the rail. */
export const SECTION_ICONS: Record<SectionSlug, LucideIcon> = {
  resumes: FileText,
  prep: MessageSquareText,
  learning: GraduationCap,
  schedule: CalendarDays,
  roadmap: ListChecks,
  rapid: Zap,
  rounds: CalendarClock,
};
