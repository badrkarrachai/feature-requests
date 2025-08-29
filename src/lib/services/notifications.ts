export interface Notification {
  id: string;
  type: "comment" | "status_change" | "feature_deleted" | "vote" | "comment_like" | "reply";
  title: string;
  message: string;
  feature_id?: string;
  comment_id?: string;
  group_key?: string;
  group_count?: number;
  latest_actor_name?: string;
  feature_title?: string;
  app_slug?: string;
  read: boolean;
  created_at: string;
  updated_at: string;
}

export class NotificationService {
  // Get notifications for current user
  static async getNotifications(email: string, name: string, limit: number = 50, appSlug?: string): Promise<Notification[]> {
    const params = new URLSearchParams({
      email: email,
      name: name,
      limit: limit.toString(),
    });
    if (appSlug) {
      params.set("app_slug", appSlug);
    }
    const response = await fetch(`/api/notifications?${params.toString()}`);
    if (!response.ok) throw new Error("Failed to fetch notifications");
    const data = await response.json();
    return data.items || [];
  }

  // Mark notification as read
  static async markAsRead(notificationId: string, email: string, name: string): Promise<void> {
    const response = await fetch(`/api/notifications/${notificationId}?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`, {
      method: "POST",
    });
    if (!response.ok) throw new Error("Failed to mark notification as read");
  }

  // Mark all notifications as read
  static async markAllAsRead(email: string, name: string, appSlug?: string): Promise<void> {
    const params = new URLSearchParams({
      email: email,
      name: name,
    });
    if (appSlug) {
      params.set("app_slug", appSlug);
    }
    const response = await fetch(`/api/notifications/mark-all-read?${params.toString()}`, {
      method: "POST",
    });
    if (!response.ok) throw new Error("Failed to mark all notifications as read");
  }

  // Get unread count
  static async getUnreadCount(email: string, name: string, appSlug?: string): Promise<number> {
    const params = new URLSearchParams({
      email: email,
      name: name,
    });
    if (appSlug) {
      params.set("app_slug", appSlug);
    }
    const response = await fetch(`/api/notifications/unread-count?${params.toString()}`);
    if (!response.ok) throw new Error("Failed to fetch unread count");
    const data = await response.json();
    return data.count || 0;
  }
}
