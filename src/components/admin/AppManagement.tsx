"use client";

import React, { useState, forwardRef, useImperativeHandle } from "react";
import { AppSelector } from "./AppSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { adminApi } from "@/services/adminApi";
import { Loader } from "lucide-react";
import type { App } from "@/types/admin";

interface AppManagementProps {
  selectedApp: App | null;
  onAppSelect: (app: App | null) => void;
  restoreSelectedApp?: (availableApps: App[]) => void;
  className?: string;
}

export interface AppManagementRef {
  openCreateModal: () => void;
}

export const AppManagement = forwardRef<AppManagementRef, AppManagementProps>(
  ({ selectedApp, onAppSelect, restoreSelectedApp, className = "" }, ref) => {
    // Add app dialog state
    const [isAddAppDialogOpen, setIsAddAppDialogOpen] = useState(false);
    const [newAppName, setNewAppName] = useState("");
    const [newAppSlug, setNewAppSlug] = useState("");
    const [isCreatingApp, setIsCreatingApp] = useState(false);

    // Delete confirmation dialog state
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Expose the openCreateModal function via ref
    useImperativeHandle(ref, () => ({
      openCreateModal: () => {
        setIsAddAppDialogOpen(true);
      },
    }));

    const handleAddApp = () => {
      setIsAddAppDialogOpen(true);
    };

    const handleCreateApp = async () => {
      if (!newAppName.trim() || !newAppSlug.trim()) {
        return;
      }

      try {
        setIsCreatingApp(true);
        const newApp = await adminApi.createApp(newAppName.trim(), newAppSlug.trim());

        // Close dialog and reset form
        setIsAddAppDialogOpen(false);
        setNewAppName("");
        setNewAppSlug("");

        // Select the newly created app immediately
        onAppSelect(newApp);
      } catch (error) {
        console.error("Error creating app:", error);
        // Error handling is done in the API call
      } finally {
        setIsCreatingApp(false);
      }
    };

    const handleDeleteApp = () => {
      setShowDeleteConfirm(true);
    };

    const handleConfirmDeleteApp = async () => {
      if (!selectedApp) return;

      try {
        await adminApi.deleteApp(selectedApp.id); // Safe mode: only delete orphaned users

        // Get updated apps from cache after deletion
        const { getAppsCache } = await import("./AppSelector");
        const currentCache = getAppsCache();
        const currentApps = currentCache?.apps || [];

        // Find the next app to select
        const deletedAppIndex = currentApps.findIndex((app) => app.id === selectedApp.id);
        let nextAppToSelect: App | null = null;

        if (currentApps.length > 0) {
          // If there are more apps, select the next one, or the previous one if it's the last
          if (deletedAppIndex < currentApps.length) {
            // Select the next app in the list
            nextAppToSelect = currentApps[deletedAppIndex] || currentApps[0];
          } else {
            // Select the previous app (it's the last one)
            nextAppToSelect = currentApps[deletedAppIndex - 1] || currentApps[0];
          }
        }

        // Select the next app or null if no apps remain
        onAppSelect(nextAppToSelect);

        // Close confirmation dialog
        setShowDeleteConfirm(false);

        // Show success message
        toast.success(`App "${selectedApp.name}" deleted successfully. Inactive users were automatically cleaned up.`);
      } catch (error) {
        console.error("Error deleting app:", error);
        toast.error("Failed to delete app");
      }
    };

    return (
      <>
        <div data-app-management>
          <AppSelector
            selectedAppId={selectedApp?.id || null}
            onAppSelect={onAppSelect}
            restoreSelectedApp={restoreSelectedApp}
            onAddApp={handleAddApp}
            onDeleteApp={handleDeleteApp}
            className={className}
          />
        </div>

        {/* Add App Dialog */}
        <Dialog open={isAddAppDialogOpen} onOpenChange={setIsAddAppDialogOpen}>
          <DialogContent className="sm:max-w-[425px] bg-white dark:bg-[#121212]">
            <DialogHeader>
              <DialogTitle>Add New Application</DialogTitle>
              <DialogDescription>Create a new application to manage feature requests and data.</DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateApp();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="app-name">Application Name</Label>
                <Input
                  id="app-name"
                  type="text"
                  placeholder="My Awesome App"
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                  required
                  disabled={isCreatingApp}
                  className="h-10 bg-slate-50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="app-slug">Application Slug</Label>
                <Input
                  id="app-slug"
                  type="text"
                  placeholder="my_awesome_app"
                  value={newAppSlug}
                  onChange={(e) => setNewAppSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                  required
                  disabled={isCreatingApp}
                  className="h-10 bg-slate-50"
                />
                <p className="text-xs text-muted-foreground">Used in URLs and API calls. Only lowercase letters, numbers, and underscores allowed.</p>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddAppDialogOpen(false)} disabled={isCreatingApp}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!newAppName.trim() || !newAppSlug.trim() || isCreatingApp}
                  className="text-white dark:text-primary-foreground"
                >
                  {isCreatingApp ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Application"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Application</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to delete "{selectedApp?.name}"? This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDeleteApp}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-white"
              >
                Delete Application
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }
);
