"use client";

import { BarChart3, FileText, LogOut, Shield, Users } from "lucide-react";
import React, { useEffect, useState } from "react";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminsManagement } from "@/components/admin/AdminsManagement";
import { FeaturesManagement } from "@/components/admin/FeaturesManagement";
import { DarkModeToggle } from "@/components/admin/DarkModeToggle";
import { ChangePasswordModal } from "@/components/admin/ChangePasswordModal";
import { AdminAuthProvider, useAdminAuth } from "@/hooks/useAdminAuth";
import { DarkModeProvider } from "@/hooks/useDarkMode";
import type { AdminTabType } from "@/types/admin";

function AdminContent() {
  const { isAuthenticated, currentAdmin, isLoading, logout } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<AdminTabType>("dashboard");
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      setActiveTab("dashboard");
      // Check if admin needs to change default password
      if (currentAdmin?.isDefaultPassword) {
        setShowPasswordModal(true);
      }
    }
  }, [isAuthenticated, currentAdmin?.isDefaultPassword]);

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
        return <AdminDashboard currentAdmin={currentAdmin} onLogout={logout} activeTab={activeTab} onTabChange={setActiveTab} />;
      case "features":
        return <FeaturesManagement />;
      case "admins":
        return <AdminsManagement />;
      default:
        return <AdminDashboard currentAdmin={currentAdmin} onLogout={logout} activeTab={activeTab} onTabChange={setActiveTab} />;
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
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-white dark:text-primary-foreground font-semibold text-sm">
                    {currentAdmin?.name
                      ?.split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .toUpperCase() || "A"}
                  </span>
                </div>
                <div className="hidden md:block">
                  <p className="text-sm font-medium text-foreground">{currentAdmin?.name.charAt(0).toUpperCase() + currentAdmin?.name.slice(1)}</p>
                  <p className="text-xs text-muted-foreground">{currentAdmin?.email}</p>
                </div>
              </div>
              <DarkModeToggle />
              <button onClick={logout} className="p-2 rounded-lg bg-secondary hover:bg-accent transition-colors border border-border" title="Logout">
                <LogOut className="w-4 h-4 text-muted-foreground" />
              </button>
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
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-primary text-white dark:text-primary-foreground shadow-sm"
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
