"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function NewFeatureModal({
  email,
  name,
  open,
  onClose,
  onCreated,
}: {
  email: string;
  name: string;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  async function onSubmit(data: FormData) {
    const title = String(data.get("title") || "").trim();
    const description = String(data.get("description") || "").trim();
    if (!title || !description) return;
    const res = await fetch("/api/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, email }),
    });
    if (res.ok) onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request a new feature</DialogTitle>
        </DialogHeader>
        <form action={onSubmit}>
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
            <Button type="button" size={"lg"} variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size={"lg"} className="text-white">
              Submit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
