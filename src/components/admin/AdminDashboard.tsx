"use client";

import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle,
  CircleAlert,
  Clock,
  FileText,
  Loader,
  MessageSquare,
  Shield,
  ThumbsUp,
  User,
  Users,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { adminApi } from "@/services/adminApi";
import type { AdminStats, AdminTabType, AdminUser, FeatureRequest } from "@/types/admin";
import { formatNumber, formatCount } from "@/lib/utils/numbers";

interface AdminDashboardProps {
  currentAdmin: AdminUser;
  onLogout: () => void;
  activeTab: AdminTabType;
  onTabChange: (tab: AdminTabType) => void;
}

const statusConfig = {
  under_review: {
    label: "Under Review",
    color: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-600 ",
    icon: CircleAlert,
  },
  planned: {
    label: "Planned",
    color: "bg-blue-50 text-blue-700  dark:bg-blue-900/20 dark:text-blue-500",
    icon: Clock,
  },
  in_progress: {
    label: "In Progress",
    color: "bg-purple-50 text-purple-700  dark:bg-purple-900/20 dark:text-purple-500 ",
    icon: Loader,
  },
  done: {
    label: "Complete",
    color: "bg-emerald-50 text-emerald-700  dark:bg-emerald-900/20 dark:text-emerald-500",
    icon: CheckCircle,
  },
};

export function AdminDashboard({ currentAdmin, onLogout, activeTab, onTabChange }: AdminDashboardProps) {
  const [stats, setStats] = useState<AdminStats>({
    totalFeatures: 0,
    totalVotes: 0,
    totalComments: 0,
    totalAdmins: 0,
  });
  const [recentFeatures, setRecentFeatures] = useState<FeatureRequest[]>([]);
  const [trends, setTrends] = useState<{
    total_features?: {
      current: number;
      previous: number;
      percentage: number;
      calculatedAt: string;
      periodStart: string;
      periodEnd: string;
    };
    total_votes?: {
      current: number;
      previous: number;
      percentage: number;
      calculatedAt: string;
      periodStart: string;
      periodEnd: string;
    };
    total_comments?: {
      current: number;
      previous: number;
      percentage: number;
      calculatedAt: string;
      periodStart: string;
      periodEnd: string;
    };
  }>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      const [statsData, featuresData, trendsData] = await Promise.all([
        adminApi.getAdminStats(),
        adminApi.getFeatures({ limit: 5, sort: "new" }),
        adminApi.getTrends(),
      ]);

      setStats(statsData);
      setRecentFeatures(featuresData.items);
      setTrends(trendsData.trends);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTrend = (percentage: number): string | null => {
    // Don't show trend if it's 0%
    if (percentage === 0) return null;

    const sign = percentage >= 0 ? "+" : "";
    // Show no decimal places for whole numbers, one decimal place for fractions
    const formatted = percentage % 1 === 0 ? percentage.toFixed(0) : percentage.toFixed(1);
    return `${sign}${formatted}%`;
  };

  const getTrendColor = (percentage: number): string => {
    if (percentage > 0) return "text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400";
    if (percentage < 0) return "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400";
    return "text-gray-600 bg-gray-50 dark:bg-gray-900/20 dark:text-gray-400";
  };

  const statCards = [
    {
      label: "Total Features",
      value: stats.totalFeatures,
      icon: FileText,
      color: "blue",
      textColor: "blue-500",
      bgColorLight: "blue-50",
      bgColorDark: "blue-900/20",
      darkTextColor: "blue-400",
      trend: trends.total_features ? formatTrend(trends.total_features.percentage) : null,
      trendColor: trends.total_features ? getTrendColor(trends.total_features.percentage) : "",
    },
    {
      label: "Total Votes",
      value: stats.totalVotes,
      icon: ThumbsUp,
      color: "green",
      bgColorLight: "green-50",
      bgColorDark: "green-900/20",
      textColor: "green-600",
      darkTextColor: "green-500",
      trend: trends.total_votes ? formatTrend(trends.total_votes.percentage) : null,
      trendColor: trends.total_votes ? getTrendColor(trends.total_votes.percentage) : "",
    },
    {
      label: "Total Comments",
      value: stats.totalComments,
      icon: MessageSquare,
      color: "purple",
      bgColorLight: "purple-50",
      bgColorDark: "purple-900/20",
      textColor: "purple-500",
      darkTextColor: "purple-400",
      trend: trends.total_comments ? formatTrend(trends.total_comments.percentage) : null,
      trendColor: trends.total_comments ? getTrendColor(trends.total_comments.percentage) : "",
    },
    {
      label: "Admins",
      value: stats.totalAdmins,
      icon: Shield,
      color: "amber",
      bgColorLight: "amber-50",
      bgColorDark: "amber-900/20",
      textColor: "amber-700",
      darkTextColor: "amber-400",
      trend: null, // No trend for admins as requested
      trendColor: "",
    },
  ];

  const tabs = [
    { id: "dashboard" as AdminTabType, label: "Dashboard", icon: BarChart3 },
    { id: "features" as AdminTabType, label: "Features", icon: FileText },
    { id: "admins" as AdminTabType, label: "Admins", icon: Users },
  ];

  return (
    <>
      {/* Dashboard Content */}
      <div className="space-y-6 md:space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 md:gap-6 gap-4">
          {statCards.map((stat, index) => (
            <div key={index} className="bg-card rounded-2xl md:p-6 p-4 border border-border shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-${stat.bgColorLight} dark:bg-${stat.bgColorDark}`}>
                  <stat.icon className={`w-6 h-6 text-${stat.textColor} dark:text-${stat.darkTextColor}`} />
                </div>
                {stat.trend && (
                  <span className={`text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1 ${stat.trendColor}`}>
                    {stat.trend}
                    {trends.total_features && stat.label === "Total Features" && trends.total_features.percentage > 0 && (
                      <ArrowUpRight className="w-3 h-3" />
                    )}
                    {trends.total_features && stat.label === "Total Features" && trends.total_features.percentage < 0 && (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    {trends.total_votes && stat.label === "Total Votes" && trends.total_votes.percentage > 0 && <ArrowUpRight className="w-3 h-3" />}
                    {trends.total_votes && stat.label === "Total Votes" && trends.total_votes.percentage < 0 && (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    {trends.total_comments && stat.label === "Total Comments" && trends.total_comments.percentage > 0 && (
                      <ArrowUpRight className="w-3 h-3" />
                    )}
                    {trends.total_comments && stat.label === "Total Comments" && trends.total_comments.percentage < 0 && (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-foreground mb-1">{formatNumber(stat.value)}</p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Recent Features */}
        <div className="bg-card rounded-2xl border border-border shadow-sm">
          <div className="p-4 md:p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <h2 className="text-base md:text-lg font-semibold text-foreground">Recent Feature Requests</h2>
              <button
                onClick={() => onTabChange("features")}
                className="text-primary hover:opacity-80 text-xs md:text-sm font-medium flex items-center gap-1 px-2 py-1 md:px-0 md:py-0 rounded md:rounded-none hover:bg-primary/10 transition-colors"
              >
                View all
                <ArrowUpRight className="w-3 h-3 md:w-4 md:h-4" />
              </button>
            </div>
          </div>
          <div className="divide-y divide-border">
            {isLoading ? (
              <div className="p-8 md:p-12 text-center">
                <div className="animate-spin rounded-full h-6 w-6 md:h-8 md:w-8 border-b-2 border-primary mx-auto mb-3 md:mb-4"></div>
                <p className="text-sm md:text-base text-muted-foreground">Loading recent features...</p>
              </div>
            ) : recentFeatures.length === 0 ? (
              <div className="p-8 md:p-12 text-center">
                <FileText className="w-10 h-10 md:w-12 md:h-12 text-muted-foreground mx-auto mb-3 md:mb-4" />
                <h3 className="text-base md:text-lg font-medium text-foreground mb-2">No features found</h3>
                <p className="text-sm md:text-base text-muted-foreground">No feature requests have been submitted yet.</p>
              </div>
            ) : (
              recentFeatures.slice(0, 5).map((feature) => {
                const StatusIcon = statusConfig[feature.status]?.icon || AlertCircle;
                return (
                  <div key={feature.id} className="p-4 md:p-6 hover:bg-muted transition-colors">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4">
                      <div className="flex-1">
                        <div className="flex flex-col gap-2 mb-2">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="text-base md:text-base lg:text-base font-semibold text-foreground break-words line-clamp-2 overflow-hidden flex-1 min-w-0">
                              {feature.title}
                            </h3>
                            <div
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 md:px-3 md:py-[0.4rem] rounded-full text-xs md:text-sm font-medium flex-shrink-0 ${
                                statusConfig[feature.status]?.color
                              }`}
                            >
                              <StatusIcon className="w-3 h-3 md:w-4 md:h-4" />
                              {statusConfig[feature.status]?.label}
                            </div>
                          </div>
                          <p className="text-xs sm:text-base md:text-base lg:text-sm text-muted-foreground mb-3 line-clamp-3 overflow-hidden leading-relaxed">
                            {feature.description}
                          </p>
                        </div>

                        {/* Metadata - Responsive flex layout */}
                        <div className="flex flex-wrap gap-2 sm:gap-4 lg:gap-6 text-sm lg:text-base text-muted-foreground">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <span className="truncate block">{feature.author_name}</span>
                              <span className="truncate block text-xs">{feature.author_email}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                              <ThumbsUp className="w-4 h-4" />
                            </div>
                            <span className="text-xs sm:text-sm">{formatCount(feature.votes_count, "vote")}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                              <MessageSquare className="w-4 h-4" />
                            </div>
                            <span className="text-xs sm:text-sm">{formatCount(feature.comments_count, "comment")}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                              <Clock className="w-4 h-4" />
                            </div>
                            <span className="text-xs sm:text-sm">{new Date(feature.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="h-32"></div>
      </div>
    </>
  );
}
