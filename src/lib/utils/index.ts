export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function truncate(s: string, n = 120) {
  if (!s) return s;
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** UI labels to match your screenshot */
export const STATUS_TEXT: Record<string, string> = {
  under_review: "Under Review",
  planned: "Planned",
  in_progress: "In Progress",
  done: "Complete",
};

export const STATUS_STYLE: Record<string, string> = {
  // Under Review - Orange/Amber for attention/action needed
  under_review: "border-orange-300 text-orange-800 bg-orange-50",

  // Planned - Blue for future/planning
  planned: "border-blue-300 text-blue-800 bg-blue-50",

  // In Progress - Purple (matches your brand!) for active work
  in_progress: "border-purple-300 text-purple-800 bg-purple-50",

  // Done/Complete - Green for success/completion
  done: "border-green-300 text-green-800 bg-green-50",
};
