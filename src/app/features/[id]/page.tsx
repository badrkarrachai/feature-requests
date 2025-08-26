import { Suspense } from "react";
import FeatureDetailContent from "@/components/features/FeatureDetailContent";

export default async function FeaturePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ email?: string; name?: string }>;
}) {
  const { id } = await params;
  const { email, name } = await searchParams;

  return (
    <Suspense
      fallback={
        <div className="container mx-auto max-w-3xl px-4 py-6">
          <div className="space-y-6">
            {/* Header skeleton */}
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-gray-200 rounded animate-pulse" />
              <div className="w-32 h-6 bg-gray-200 rounded animate-pulse" />
            </div>

            {/* Content skeleton */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-xs">
              <div className="p-6 space-y-4">
                <div className="w-3/4 h-8 bg-gray-200 rounded animate-pulse" />
                <div className="flex items-center gap-3">
                  <div className="w-16 h-6 bg-gray-200 rounded animate-pulse" />
                  <div className="w-12 h-12 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="space-y-2">
                  <div className="w-full h-4 bg-gray-200 rounded animate-pulse" />
                  <div className="w-2/3 h-4 bg-gray-200 rounded animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <FeatureDetailContent featureId={id} email={email || ""} name={name || ""} />
    </Suspense>
  );
}
