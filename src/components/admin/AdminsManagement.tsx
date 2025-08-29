"use client";

import { Eye, EyeOff, Plus, Shield, Trash2, Users } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { adminApi } from "@/services/adminApi";
import type { AdminUser, NewAdminForm } from "@/types/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { CheckCircle, AlertCircle } from "lucide-react";

export function AdminsManagement() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newAdmin, setNewAdmin] = useState<NewAdminForm>({
    name: "",
    email: "",
    password: "",
    showPassword: false,
  });
  const [persistentAlert, setPersistentAlert] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [adminToDelete, setAdminToDelete] = useState<AdminUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadAdmins();
  }, []);

  const showPersistentAlert = (type: "success" | "error" | "info", message: string) => {
    setPersistentAlert({ type, message });
    // Auto-hide after 5 seconds for non-critical alerts
    if (type !== "error") {
      setTimeout(() => setPersistentAlert(null), 5000);
    }
  };

  const dismissPersistentAlert = () => {
    setPersistentAlert(null);
  };

  const loadAdmins = async () => {
    try {
      setIsLoading(true);
      const adminsData = await adminApi.getAllAdmins();
      setAdmins(adminsData);
    } catch (error) {
      console.error("Error loading admins:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newAdmin.name || !newAdmin.email || !newAdmin.password) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      setIsCreating(true);
      const createdAdmin = await adminApi.createAdmin({
        name: newAdmin.name,
        email: newAdmin.email,
        password: newAdmin.password,
      });

      if (createdAdmin) {
        setAdmins((prev) => [...prev, createdAdmin]);
        setShowAddAdmin(false);
        setNewAdmin({ name: "", email: "", password: "", showPassword: false });
        // Use toast for immediate feedback
        toast.success("Admin created successfully!");
        // Use persistent alert for important system messages (optional)
        // showPersistentAlert("success", `Admin ${createdAdmin.name} has been created and can now access the system.`);
      } else {
        toast.error("Failed to create admin");
        // For critical errors, you could also show a persistent alert
        // showPersistentAlert("error", "Failed to create admin account. Please try again.");
      }
    } catch (error) {
      console.error("Error creating admin:", error);
      toast.error("Failed to create admin");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRemoveAdmin = async () => {
    if (!adminToDelete) return;

    try {
      setIsDeleting(true);
      const result = await adminApi.removeAdmin(adminToDelete.id);

      if (result.success) {
        // Remove the admin from the local state (they're no longer an admin)
        setAdmins((prev) => prev.filter((admin) => admin.id !== adminToDelete.id));
        toast.success(result.message);
        // Use persistent alert for important system messages
        showPersistentAlert("success", `Admin ${adminToDelete.name} has been demoted to user. They can no longer access admin features.`);
      } else {
        toast.error(result.message);
        showPersistentAlert("error", result.message);
      }
    } catch (error) {
      console.error("Error removing admin:", error);
      toast.error("Failed to remove admin");
      showPersistentAlert("error", "An unexpected error occurred while removing admin privileges.");
    } finally {
      setIsDeleting(false);
      setAdminToDelete(null);
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Add Admin Button */}
        <div className="flex justify-end">
          <Dialog open={showAddAdmin} onOpenChange={setShowAddAdmin}>
            <DialogTrigger asChild>
              <Button className="text-white dark:text-primary-foreground">
                <Plus className="w-4 h-4" />
                Add Admin
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-[425px] bg-white dark:bg-[#121212]">
              <DialogHeader>
                <DialogTitle>Add New Admin</DialogTitle>
                <DialogDescription>Create a new administrator account. The admin will have full access to the system.</DialogDescription>
              </DialogHeader>

              <form onSubmit={handleCreateAdmin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    type="text"
                    value={newAdmin.name}
                    onChange={(e) => setNewAdmin((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Admin Name"
                    required
                    className="h-10 bg-slate-50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newAdmin.email}
                    onChange={(e) => setNewAdmin((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="admin@example.com"
                    required
                    className="h-10 bg-slate-50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={newAdmin.showPassword ? "text" : "password"}
                      value={newAdmin.password}
                      onChange={(e) =>
                        setNewAdmin((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                      placeholder="••••••••"
                      required
                      className="h-10 bg-slate-50"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setNewAdmin((prev) => ({
                          ...prev,
                          showPassword: !prev.showPassword,
                        }))
                      }
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {newAdmin.showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowAddAdmin(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isCreating} className="text-white dark:text-primary-foreground">
                    {isCreating ? "Creating..." : "Add Admin"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Admins Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl p-6 border border-border shadow-xs animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-muted rounded-xl"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                    <div className="h-3 bg-muted rounded w-2/3"></div>
                  </div>
                </div>
              </div>
            ))
          ) : admins.length === 0 ? (
            <div className="col-span-full bg-card rounded-2xl p-12 border border-border text-center">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No admins found</h3>
              <p className="text-muted-foreground">No administrators have been created yet.</p>
            </div>
          ) : (
            admins.map((admin) => (
              <div key={admin.id} className="bg-card rounded-2xl p-5 border border-border shadow-xs hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
                    {admin.image_url ? (
                      <img src={admin.image_url} alt={admin.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-primary rounded-xl flex items-center justify-center">
                        <span className="text-white dark:text-primary-foreground font-semibold text-xl">
                          {admin.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{admin.name.charAt(0).toUpperCase() + admin.name.slice(1)}</h3>
                    <p className="text-sm text-muted-foreground truncate">{admin.email}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">Administrator</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Added {new Date(admin.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {admin.email !== "admin@admin.com" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 w-9 p-2 border-destructive/20 text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30 transition-colors"
                            onClick={() => setAdminToDelete(admin)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-white dark:bg-[#121212]">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove Admin</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove admin privileges from <strong>{admin.name}</strong> ({admin.email})? This action will
                              demote them to a regular user and they will lose access to all admin features.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleRemoveAdmin}
                              disabled={isDeleting}
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              {isDeleting ? "Removing..." : "Remove Admin"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Persistent Alert for important messages */}
        {persistentAlert && (
          <Alert variant={persistentAlert.type === "error" ? "destructive" : "default"}>
            {persistentAlert.type === "success" && <CheckCircle className="h-4 w-4" />}
            {persistentAlert.type === "error" && <AlertCircle className="h-4 w-4" />}
            <AlertTitle>
              {persistentAlert.type === "success" && "Success"}
              {persistentAlert.type === "error" && "Error"}
              {persistentAlert.type === "info" && "Info"}
            </AlertTitle>
            <AlertDescription>{persistentAlert.message}</AlertDescription>
            <button onClick={dismissPersistentAlert} className="absolute right-4 top-4 opacity-70 hover:opacity-100" aria-label="Dismiss alert">
              <AlertCircle className="h-4 w-4" />
            </button>
          </Alert>
        )}
      </div>
    </>
  );
}
