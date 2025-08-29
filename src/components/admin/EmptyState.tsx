"use client";

import React from "react";
import { Globe, Plus, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  type: "no-apps" | "no-selection";
  context: "dashboard" | "features";
  onCreateApp?: () => void;
}

function EmptyState({ type, context, onCreateApp }: EmptyStateProps) {
  const isNoApps = type === "no-apps";
  const isDashboard = context === "dashboard";

  return (
    <div className="bg-card rounded-2xl p-8 md:p-12 border border-border mt-6 md:mt-8">
      <div className="max-w-lg mx-auto text-center">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Globe className="w-8 h-8 text-primary" />
        </div>

        <h3 className="text-xl font-semibold text-foreground mb-3">
          {isNoApps
            ? isDashboard
              ? "Welcome to Admin Dashboard"
              : "Welcome to Feature Management"
            : isDashboard
            ? "Welcome to Admin Dashboard"
            : "Feature Management"}
        </h3>

        <p className="text-muted-foreground mb-6 leading-relaxed">
          {isNoApps
            ? "Get started by creating your first application to manage feature requests and gather user feedback."
            : isDashboard
            ? "Select an application from the dropdown above to start managing your feature requests, view analytics, and oversee your platform."
            : "Select an application from the dropdown above to view and manage feature requests, search through submissions, and organize your development priorities."}
        </p>

        {isNoApps && (
          <Button onClick={onCreateApp} className="bg-primary text-white dark:text-primary-foreground hover:bg-primary/90 mb-8">
            <Plus className="w-4 h-4 mr-2" />
            Create Your First App
          </Button>
        )}

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">What you can do:</h4>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            {isDashboard ? (
              <>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>View feature requests</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Monitor analytics</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Manage users</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Collect feature requests</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Engage with users</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Track progress</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { EmptyState };
export default EmptyState;
