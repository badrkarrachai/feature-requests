import { supabaseAdmin } from "@/lib/providers/supabaseAdmin";

export class ServerNotificationService {
  // Clean up old notifications (older than 30 days) - uses RPC function
  static async cleanupOldNotifications(): Promise<void> {
    const { error } = await supabaseAdmin.rpc("cleanup_old_notifications");
    if (error) throw error;
  }

  // Create a notification manually (for admin use)
  static async createNotification(
    userId: string,
    type: "comment" | "status_change" | "feature_deleted" | "vote",
    title: string,
    message: string,
    featureId?: string,
    commentId?: string
  ): Promise<string | null> {
    const { data: notificationId, error } = await supabaseAdmin.rpc("create_notification", {
      p_user_id: userId,
      p_type: type,
      p_title: title,
      p_message: message,
      p_feature_id: featureId,
      p_comment_id: commentId,
    });

    if (error) {
      console.error("Error creating notification:", error);
      return null;
    }

    return notificationId;
  }
}
