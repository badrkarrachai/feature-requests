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
  under_review: "border-orange-300 text-orange-800 bg-orange-50 dark:border-orange-600 dark:text-orange-200 dark:bg-orange-900/20",

  // Planned - Blue for future/planning
  planned: "border-blue-300 text-blue-800 bg-blue-50 dark:border-blue-600 dark:text-blue-200 dark:bg-blue-900/20",

  // In Progress - Purple (matches your brand!) for active work
  in_progress: "border-purple-300 text-purple-800 bg-purple-50 dark:border-purple-600 dark:text-purple-200 dark:bg-purple-900/20",

  // Done/Complete - Green for success/completion
  done: "border-green-300 text-green-800 bg-green-50 dark:border-green-600 dark:text-green-200 dark:bg-green-900/20",
};
