import { Mic, Smile, Hand, PersonStanding, Pencil, Zap, LucideIcon } from "lucide-react";
import { TestType } from "@/utils/testHistory";

/**
 * Single source of truth for how each test type is presented across the app
 * (icons, colours, deep-link route, label). Keeps History, Insights and any
 * other list views consistent.
 */
export interface TestTypeMeta {
  label: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  route: string;
}

export const TEST_TYPE_META: Record<TestType, TestTypeMeta> = {
  VOICE:      { label: "Voice Analysis",   icon: Mic,           iconBg: "#FFE8D6", iconColor: "#FF8C42", route: "/voice-test" },
  FACE:       { label: "Facial Scan",      icon: Smile,         iconBg: "#E8E4FF", iconColor: "#7B68EE", route: "/face-test" },
  FINGER_TAP: { label: "Finger Tap",       icon: Hand,          iconBg: "#DDD8F5", iconColor: "#7B68EE", route: "/finger-tap" },
  GAIT:       { label: "Walking / Gait",   icon: PersonStanding,iconBg: "#D4EAF5", iconColor: "#3A9BD5", route: "/walking-test" },
  DRAWING:    { label: "Drawing",          icon: Pencil,        iconBg: "#FFE0D6", iconColor: "#FF8C42", route: "/drawing-test" },
  LSVT_BIG:   { label: "LSVT BIG",         icon: Zap,           iconBg: "#F5F0D4", iconColor: "#C9A227", route: "/lsvt-big" },
};

export const getTestTypeMeta = (type: TestType): TestTypeMeta =>
  TEST_TYPE_META[type] ?? TEST_TYPE_META.VOICE;
