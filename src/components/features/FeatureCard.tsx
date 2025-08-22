"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StatusBadge from "./StatusBadge";
import { Feature } from "@/types";

export default function FeatureCard({
  email,
  item,
  showBottomBorder,
  onToggleVote,
}: {
  email: string;
  item: Feature;
  showBottomBorder: boolean;
  onToggleVote: (id: string, currentVoted: boolean) => void;
}) {
  return (
    <>
      <Card className="border-none  shadow-none ">
        <CardContent className="px-4 flex items-center justify-between">
          <div className="flex-1 pr-3">
            <h3 className="font-semibold text-gray-900">{item.title}</h3>
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.description}</p>

            <div className="mt-3 flex items-center gap-3 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="lucide lucide-comment-square-icon lucide-comment-square"
                >
                  <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
                </svg>
                <span>{item.comments_count}</span>
              </div>
              <div className="text-sm">•</div>
              <StatusBadge status={item.status} />
            </div>
          </div>

          {/* Upvote block (no layout shift) */}
          <Button
            variant="outline"
            size="sm"
            className={` h-[50px] flex flex-col items-center shadow-none font-normal justify-center rounded-md px-[0.6rem] ${
              item.votedByMe ? "border-primary bg-primary/5 text-primary" : ""
            }`}
            onClick={() => onToggleVote(item.id, !!item.votedByMe)}
            aria-pressed={item.votedByMe}
          >
            <div className="flex flex-col items-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-chevron-up-icon lucide-chevron-up"
              >
                <path d="m18 15-6-6-6 6" />
              </svg>
              <span className="text-sm font-normal">{item.votes_count}</span>
            </div>
          </Button>
        </CardContent>
      </Card>
      {/* Bottom border */}
      {showBottomBorder && <div className="border-t"></div>}
    </>
  );
}
