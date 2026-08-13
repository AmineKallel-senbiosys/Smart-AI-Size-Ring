import { RingSizer } from "@/components/sizer/RingSizer";

export default function SizerPage() {
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-10 sm:px-6 sm:py-16">
      <div className="w-full max-w-[720px]">
        <RingSizer />
      </div>
    </main>
  );
}
