export type FeatureStatus = "under_review" | "planned" | "in_progress" | "done";

export type Feature = {
  id: string;
  title: string;
  description: string;
  status: FeatureStatus;
  status_label?: string; // Human-readable status from statuses table
  votes_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  votedByMe?: boolean;
  // Author information from features_public view
  author_name: string;
  author_email: string;
  author_image_url?: string;
  author_role?: string; // 'user' or 'admin'
  // Multi-app support (required in new schema)
  app_id: string;
  app_slug: string;
  // Pagination metadata
  total_count?: number;
};

/** either a sort OR a filter (exclusive) */
export type FeatureSort = "trending" | "top" | "new" | null;
export type FeatureFilter = "all" | "under_review" | "planned" | "in_progress" | "done" | "mine";

export type Comment = {
  id: string;
  content: string | null; // can be null when soft deleted
  created_at: string;
  edited_at?: string | null;
  author_name: string;
  author_email: string;
  author_image_url?: string;
  author_role?: string; // 'user' or 'admin'
  feature_id: string;
  parent_id?: string | null; // for replies
  is_deleted: boolean;
  likes_count: number;
  replies_count: number;
  user_has_liked?: boolean; // From RPC functions
  // Nested replies structure
  replies?: {
    items: Comment[];
    has_more: boolean;
    total_count: number;
  };
};

export type Activity = {
  id: string;
  type: "comment" | "status_change" | "vote";
  content?: string | null;
  created_at: string;
  author_name: string;
  author_email: string;
  author_image_url?: string;
  author_role?: string; // 'user' or 'admin'
  old_status?: string;
  new_status?: string;
  feature_id?: string;
  // Enhanced comment fields
  is_deleted?: boolean;
  likes_count?: number;
  replies_count?: number;
  edited_at?: string | null;
  user_has_liked?: boolean;
  parent_comment_id?: string | null; // for replies
  // Reply pagination fields (for main comments only)
  replies_has_more?: boolean;
  replies_total_count?: number;
};

// App types for multi-app support
export type App = {
  id: string;
  slug: string;
  name: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
};

// Status types for the new lookup system
export type Status = {
  id: number;
  slug: string;
  label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// Notification types enhanced
export type Notification = {
  id: string;
  user_id: string;
  app_id?: string;
  type: "comment" | "status_change" | "feature_deleted" | "vote" | "comment_like" | "reply";
  title: string;
  message: string;
  feature_id?: string;
  comment_id?: string;
  group_key?: string;
  group_count: number;
  latest_actor_id?: string;
  latest_actor_name?: string;
  latest_actor_email?: string;
  feature_title?: string;
  read: boolean;
  read_at?: string;
  created_at: string;
  updated_at: string;
};

// Trends types for analytics
export type TrendMetric = {
  metric_name: string;
  current_value: number;
  previous_value: number;
  trend_percent: number;
  period_start: string;
  period_end: string;
  computed_at: string;
};

// Pagination response wrapper
export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  total: number;
  pageSize: number;
  hasMore: boolean;
};
