export type FeatureStatus = "under_review" | "planned" | "in_progress" | "done";

export type Feature = {
  id: string;
  title: string;
  description: string;
  status: FeatureStatus;
  votes_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
  user_id?: string;
  created_by?: string;
  votedByMe?: boolean;
  // Author information from features_public view
  name?: string;
  email?: string;
  author_name?: string;
  author_email?: string;
  author_image_url?: string;
};

/** either a sort OR a filter (exclusive) */
export type FeatureSort = "trending" | "top" | "new" | null;
export type FeatureFilter =
  | "all"
  | "under_review"
  | "planned"
  | "in_progress"
  | "done"
  | "mine";
