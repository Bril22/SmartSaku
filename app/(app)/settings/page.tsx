import Image from "next/image";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { logout } from "@/app/actions";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({ where: { id: userId } });

  return (
    <div className="max-w-md">
      <h1 className="font-display text-2xl font-semibold mb-5">Settings</h1>

      <div className="bg-card border border-line rounded-lg p-4 mb-4 flex items-center gap-4">
        <Image
          src="/brand/mascot-abacus.png"
          alt="Saku-Kun"
          width={72}
          height={72}
          className="rounded-2xl"
        />
        <div>
          <div className="font-bold text-[15px]">{user?.name}</div>
          <div className="text-sm text-inksoft">{user?.email}</div>
        </div>
      </div>

      <div className="bg-card border border-line rounded-lg divide-y divide-line mb-4">
        {[
          ["👤", "Profile & password", "coming in the next update"],
          ["💱", "Currency", "IDR — more currencies coming soon"],
          ["🏦", "Manage accounts", "coming in the next update"],
          ["🏷️", "Manage categories", "coming in the next update"],
        ].map(([icon, title, sub]) => (
          <div key={title} className="px-4 py-3.5 flex items-center gap-3 opacity-60">
            <span className="text-lg">{icon}</span>
            <div className="flex-1">
              <div className="font-semibold text-[13.5px]">{title}</div>
              <div className="text-[11.5px] text-inksoft">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      <form action={logout}>
        <button className="w-full rounded-full border-2 border-bad text-bad font-bold py-3 text-sm">
          Sign out
        </button>
      </form>
    </div>
  );
}
