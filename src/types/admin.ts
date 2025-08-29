export interface App {
  id: string;
  slug: string;
  name: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  image_url?: string | null;
  role: "admin" | "user";
  created_at: string;
  updated_at: string;
  isDefaultPassword?: boolean;
}

export interface FeatureRequest {
  id: string;
  title: string;
  description: string;
  status: "under_review" | "planned" | "in_progress" | "done";
  votes_count: number;
  comments_count: number;
  author_name: string;
  author_email: string;
  created_at: string;
  app_id: string;
  app_slug: string;
  app_name: string;
  votedByMe?: boolean;
}

export interface AdminStats {
  totalFeatures: number;
  totalVotes: number;
  totalComments: number;
  totalAdmins: number;
}

export interface AdminTab {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
}

export interface NewAdminForm {
  name: string;
  email: string;
  password: string;
  showPassword: boolean;
}

export interface LoginForm {
  email: string;
  password: string;
  showPassword: boolean;
}

export type AdminTabType = "dashboard" | "features" | "admins";

export interface AppSelectionState {
  selectedAppId: string | null;
  selectedAppSlug: string | null;
  selectedAppName: string | null;
  availableApps: App[];
}
