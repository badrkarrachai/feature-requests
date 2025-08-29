"use client";

import { BarChart3, FileText, LogOut, Shield, Users } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminsManagement } from "@/components/admin/AdminsManagement";
import { FeaturesManagement } from "@/components/admin/FeaturesManagement";

import { DarkModeToggle } from "@/components/admin/DarkModeToggle";
import { ChangePasswordModal } from "@/components/admin/ChangePasswordModal";
import { AdminAuthProvider, useAdminAuth } from "@/hooks/useAdminAuth";
import { DarkModeProvider } from "@/hooks/useDarkMode";
import type { AdminTabType, App } from "@/types/admin";
import { useRef } from "react";
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
import { usePersistentAppSelection } from "@/hooks/usePersistentAppSelection";

function AdminContent() {
  const { isAuthenticated, currentAdmin, isLoading, logout } = useAdminAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { selectedApp, setSelectedApp, restoreSelectedApp } = usePersistentAppSelection();

  const [activeTab, setActiveTab] = useState<AdminTabType>("dashboard");
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Handle tab changes and update URL
  const handleTabChange = (newTab: AdminTabType) => {
    setActiveTab(newTab);
    // Update URL with new tab parameter
    const params = new URLSearchParams();
    params.set("tab", newTab);
    router.replace(`/admin?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (isAuthenticated) {
      // Read tab from URL parameters, default to dashboard if not present
      const urlTab = searchParams.get("tab") as AdminTabType;
      const validTabs: AdminTabType[] = ["dashboard", "features", "admins"];
      const initialTab = validTabs.includes(urlTab) ? urlTab : "dashboard";

      setActiveTab(initialTab);

      // Check if admin needs to change default password
      if (currentAdmin?.isDefaultPassword) {
        setShowPasswordModal(true);
      }
    }
  }, [isAuthenticated, currentAdmin?.isDefaultPassword, searchParams]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !currentAdmin) {
    return (
      <AdminLogin
        onLoginSuccess={() => {
          /* provider updates state */
        }}
      />
    );
  }

  const tabs = [
    { id: "dashboard" as AdminTabType, label: "Dashboard", icon: BarChart3 },
    { id: "features" as AdminTabType, label: "Features", icon: FileText },
    { id: "admins" as AdminTabType, label: "Admins", icon: Users },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "dashboard":
        return (
          <AdminDashboard
            currentAdmin={currentAdmin}
            onLogout={logout}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            selectedApp={selectedApp}
            onAppSelect={setSelectedApp}
            restoreSelectedApp={restoreSelectedApp}
          />
        );
      case "features":
        return <FeaturesManagement selectedApp={selectedApp} onAppSelect={setSelectedApp} activeTab={activeTab} />;
      case "admins":
        return <AdminsManagement />;
      default:
        return (
          <AdminDashboard
            currentAdmin={currentAdmin}
            onLogout={logout}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            selectedApp={selectedApp}
            onAppSelect={setSelectedApp}
            restoreSelectedApp={restoreSelectedApp}
          />
        );
    }
  };

  return (
    <div className="bg-gradient-to-br from-background to-primary/5 bg-background  dark:bg-[#121212] " style={{ minHeight: "100vh" }}>
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 py-2 md:py-0">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-white dark:text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-foreground">Admin Panel</h1>
                <p className="text-xs md:text-sm text-muted-foreground">Feature Request Management</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                  {currentAdmin?.image_url ? (
                    <img src={currentAdmin.image_url} alt={currentAdmin.name || "Admin"} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-primary rounded-full flex items-center justify-center">
                      <span className="text-white dark:text-primary-foreground font-semibold text-sm">
                        {currentAdmin?.name
                          ?.split(" ")
                          .map((n: string) => n[0])
                          .join("")
                          .toUpperCase() || "A"}
                      </span>
                    </div>
                  )}
                </div>
                <div className="hidden md:block">
                  <p className="text-sm font-medium text-foreground">{currentAdmin?.name.charAt(0).toUpperCase() + currentAdmin?.name.slice(1)}</p>
                  <p className="text-xs text-muted-foreground">{currentAdmin?.email}</p>
                </div>
              </div>
              <DarkModeToggle />
              <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
                <AlertDialogTrigger asChild>
                  <button className="p-2 rounded-lg bg-secondary hover:bg-accent transition-colors border border-border" title="Logout">
                    <LogOut className="w-4 h-4 text-muted-foreground" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to log out? You'll need to sign in again to access the admin panel.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={logout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-white">
                      Logout
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8 py-6 md:py-8">
        {/* Navigation */}
        <div className="flex justify-center md:justify-start mb-8">
          <div className="flex gap-1 bg-card p-1 rounded-xl border border-border w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-primary text-white dark:text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {renderTabContent()}
      </div>

      {/* Password Change Modal */}
      {currentAdmin && (
        <ChangePasswordModal
          isOpen={showPasswordModal}
          adminEmail={currentAdmin.email}
          isDefaultAccount={currentAdmin.isDefaultPassword || false}
          onPasswordChanged={() => {
            setShowPasswordModal(false);
            // The modal will handle logout and force re-authentication
          }}
        />
      )}

      {/* Each tab now has its own AppManagement component */}
    </div>
  );
}

export default function AdminPage() {
  return (
    <DarkModeProvider>
      <AdminAuthProvider>
        <AdminContent />
      </AdminAuthProvider>
    </DarkModeProvider>
  );
}
