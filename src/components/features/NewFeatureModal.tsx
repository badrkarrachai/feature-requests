"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function NewFeatureModal({
  email,
  name,
  open,
  onClose,
  onCreated,
  imageUrl,
}: {
  email: string;
  name: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  imageUrl?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedRequests, setSubmittedRequests] = useState<Set<string>>(new Set());

  async function onSubmit(data: FormData) {
    const title = String(data.get("title") || "").trim();
    const description = String(data.get("description") || "").trim();

    // Create unique request identifier
    const requestId = `${email}:${title}:${description}`.toLowerCase();

    // Check if this exact request is already being submitted
    if (submittedRequests.has(requestId)) {
      return;
    }

    // Immediate submission lock
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setSubmittedRequests((prev) => new Set(prev).add(requestId));

    setLoading(true);

    try {
      if (!title || !description) {
        alert("Please fill in both title and description");
        return;
      }

      const res = await fetch("/api/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          email,
          name,
          image_url: imageUrl || null,
        }),
      });

      if (res.ok) {
        onCreated();
      } else {
        const errorData = await res.json().catch(() => ({}));

        // Handle duplicate feature requests
        if (res.status === 409) {
          alert("You have already requested a feature with this title. Please use a different title or check your existing requests.");
        } else {
          alert(errorData.error || "Failed to create feature request. Please try again.");
        }
      }
    } catch (error) {
      console.error("Network error:", error);
      alert("Network error. Please check your connection and try again.");
    } finally {
      // Reset states with a small buffer to prevent rapid re-submissions
      setTimeout(() => {
        setLoading(false);
        setSubmitting(false);
        setSubmittedRequests((prev) => {
          const newSet = new Set(prev);
          newSet.delete(requestId);
          return newSet;
        });
      }, 500); // 500ms buffer
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="sm:max-w-lg bg-white dark:bg-[#121212]">
        <DialogHeader>
          <DialogTitle>Request a new feature</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            onSubmit(formData);
          }}
        >
          <div className="mt-4 space-y-3">
            <div className="grid gap-1.5 mb-5">
              <Label htmlFor="title" className="mb-1">
                Title
              </Label>
              <Input id="title" name="title" required placeholder="Short, clear title" className="h-11" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="description" className="mb-1">
                Description
              </Label>
              <Textarea id="description" name="description" required placeholder="Explain what you need and why" className="min-h-[100px]" />
            </div>
          </div>
          <p className="text-xs mt-6 text-muted-foreground">
            Your first name <span className="font-medium text-foreground capitalize">{name}</span> will be visible to others. Your email{" "}
            <span className="font-medium text-foreground">{email}</span> stays private and is only used to track your votes and send updates.
          </p>
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button type="button" size={"lg"} variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" size={"lg"} className="text-white" disabled={submitting}>
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border border-white border-t-transparent mr-2" />
                  Submitting
                </>
              ) : (
                "Submit"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
