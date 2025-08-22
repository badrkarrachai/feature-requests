export type FeatureStatus = "open" | "planned" | "in_progress" | "done";

export type Feature = {
  id: string;
  title: string;
  description: string;
  status: FeatureStatus;
  votes_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
  votedByMe?: boolean;
};

/** either a sort OR a filter (exclusive) */
export type FeatureSort = "trending" | "top" | "new" | null;
export type FeatureFilter = "all" | "open" | "planned" | "in_progress" | "done" | "mine";
