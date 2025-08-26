"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock, Shield } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ChangePasswordModalProps {
  isOpen: boolean;
  adminEmail: string;
  isDefaultAccount: boolean;
  onPasswordChanged: () => void;
}

export function ChangePasswordModal({ isOpen, adminEmail, isDefaultAccount, onPasswordChanged }: ChangePasswordModalProps) {
  const { logout } = useAdminAuth();
  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    showCurrentPassword: false,
    showNewPassword: false,
    showConfirmPassword: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];
    if (password.length < 8) {
      errors.push("Password must be at least 8 characters long");
    }
    if (!/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    }
    if (!/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter");
    }
    if (!/\d/.test(password)) {
      errors.push("Password must contain at least one number");
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push("Password must contain at least one special character");
    }
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors([]);

    // Validate new password
    const passwordErrors = validatePassword(formData.newPassword);
    if (passwordErrors.length > 0) {
      setErrors(passwordErrors);
      setIsLoading(false);
      return;
    }

    // Check if passwords match
    if (formData.newPassword !== formData.confirmPassword) {
      setErrors(["New passwords do not match"]);
      setIsLoading(false);
      return;
    }

    // Check if new password is different from current
    if (formData.currentPassword === formData.newPassword) {
      setErrors(["New password must be different from current password"]);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/admins/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: adminEmail,
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to change password");
      }

      toast.success("Password changed successfully! Please log in again.");
      onPasswordChanged();

      // Force logout to re-authenticate with new password
      await logout();
    } catch (error) {
      console.error("Error changing password:", error);
      setErrors([error instanceof Error ? error.message : "Failed to change password"]);
    } finally {
      setIsLoading(false);
    }
  };

  const togglePasswordVisibility = (field: "current" | "new" | "confirm") => {
    setFormData((prev) => ({
      ...prev,
      [`show${field.charAt(0).toUpperCase() + field.slice(1)}Password`]:
        !prev[`show${field.charAt(0).toUpperCase() + field.slice(1)}Password` as keyof typeof prev],
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-[#121212]" showCloseButton={!isDefaultAccount}>
        <DialogHeader className="text-center">
          <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-destructive" />
          </div>
          <DialogTitle className="text-xl text-center font-bold">
            {isDefaultAccount ? "Default Password Detected" : "Change Password Required"}
          </DialogTitle>
          <DialogDescription className="text-sm text-center text-muted-foreground">
            {isDefaultAccount
              ? "For security reasons, you must change the default password before continuing."
              : "Please update your password to maintain account security."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current Password */}
          <div>
            <Label htmlFor="currentPassword" className="text-sm font-medium">
              Current Password
            </Label>
            <div className="relative mt-2">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="currentPassword"
                type={formData.showCurrentPassword ? "text" : "password"}
                value={formData.currentPassword}
                onChange={(e) => setFormData((prev) => ({ ...prev, currentPassword: e.target.value }))}
                className="pl-10 pr-10 h-10"
                placeholder={isDefaultAccount ? "Enter 'admin'" : "Enter current password"}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => togglePasswordVisibility("current")}
              >
                {formData.showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <Label htmlFor="newPassword" className="text-sm font-medium">
              New Password
            </Label>
            <div className="relative mt-2">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="newPassword"
                type={formData.showNewPassword ? "text" : "password"}
                value={formData.newPassword}
                onChange={(e) => setFormData((prev) => ({ ...prev, newPassword: e.target.value }))}
                className="pl-10 pr-10 h-10"
                placeholder="Enter new secure password"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => togglePasswordVisibility("new")}
              >
                {formData.showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <Label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm New Password
            </Label>
            <div className="relative mt-2">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type={formData.showConfirmPassword ? "text" : "password"}
                value={formData.confirmPassword}
                onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                className="pl-10 pr-10 h-10"
                placeholder="Confirm new password"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => togglePasswordVisibility("confirm")}
              >
                {formData.showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Password Requirements */}
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Password Requirements:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• At least 8 characters long</li>
              <li>• One uppercase letter (A-Z)</li>
              <li>• One lowercase letter (a-z)</li>
              <li>• One number (0-9)</li>
              <li>• One special character (!@#$%^&*...)</li>
            </ul>
          </div>

          {/* Error Display */}
          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1">
                  {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <Button type="submit" className="w-full text-white dark:text-primary-foreground h-11" disabled={isLoading}>
            {isLoading ? "Changing Password..." : "Change Password"}
          </Button>
        </form>

        {isDefaultAccount && (
          <div className="mt-2 p-3  rounded-lg opacity-80">
            <p className="text-xs text-destructive font-medium text-center">This action cannot be skipped for security reasons</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
