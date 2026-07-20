import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import TabBar from "@/components/TabBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  return (
    <div className="flex-1">
      <TabBar />
      <main className="md:ml-56 px-4 pt-5 pb-28 md:pb-10 md:px-10 max-w-3xl md:max-w-none mx-auto md:mx-0">
        {children}
      </main>
    </div>
  );
}
