import { Suspense } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import TabBar from "@/components/TabBar";
import Toaster from "@/components/Toaster";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const exists = await prisma.user.count({ where: { id: userId } });
  if (exists === 0) redirect("/login");
  return (
    <div className="flex-1">
      <TabBar />
      <Suspense fallback={null}>
        <Toaster />
      </Suspense>
      <main className="md:ml-56 px-4 pt-5 pb-28 md:pb-10 md:px-10 max-w-3xl md:max-w-none mx-auto md:mx-0">
        {children}
      </main>
    </div>
  );
}
