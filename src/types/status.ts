// Canonical enum values we store in Postgres
export const STATUS_VALUES = [
  "under_review",
  "planned",
  "in_progress",
  "done",
] as const;
export type FeatureStatus = (typeof STATUS_VALUES)[number];

// Accepts "Under Review", "under-review", "open", "In Progress", etc. → returns enum value
export function normalizeStatus(input: string): FeatureStatus {
  const s = String(input)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  // aliases
  const map: Record<string, FeatureStatus> = {
    open: "under_review",
    review: "under_review",
    underreview: "under_review",
    under_review: "under_review",

    planned: "planned",
    planning: "planned",

    in_progress: "in_progress",
    progress: "in_progress",
    active: "in_progress",

    done: "done",
    complete: "done",
    completed: "done",
    finished: "done",
  };

  const value =
    (map[s] ?? (STATUS_VALUES as readonly string[]).includes(s))
      ? (s as FeatureStatus)
      : undefined;
  if (!value) throw new Error("INVALID_STATUS");
  return value;
}
