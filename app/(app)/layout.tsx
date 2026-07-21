import { Suspense } from "react";
import { requireSpace } from "@/lib/space";
import TabBar from "@/components/TabBar";
import Toaster from "@/components/Toaster";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { spaceName, personal, shared } = await requireSpace();
  return (
    <div className="flex-1">
      <TabBar spaceName={personal ? null : spaceName} shared={shared} />
      <Suspense fallback={null}>
        <Toaster />
      </Suspense>
      <main className="md:ml-56 px-4 pt-5 pb-28 md:pb-10 md:px-10 max-w-3xl md:max-w-none mx-auto md:mx-0">
        {children}
      </main>
    </div>
  );
}
