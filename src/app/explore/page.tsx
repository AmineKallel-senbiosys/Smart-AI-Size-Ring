import { ExploreFlow } from "@/components/explore/ExploreFlow";

export default function ExplorePage() {
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
      <div className="w-full max-w-[720px]">
        <ExploreFlow />
      </div>
    </main>
  );
}
