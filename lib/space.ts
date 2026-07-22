import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { readSession } from "./auth";

const COOKIE = "smartsaku_space";

export type ActiveSpace = {
  userId: string;
  spaceId: string;
  spaceName: string;
  personal: boolean;
  role: string;
  shared: boolean;
};

/** Every signed-in user always has a personal space; created on demand. */
export async function ensurePersonalSpace(userId: string): Promise<string> {
  const existing = await prisma.spaceMember.findFirst({
    where: { userId, space: { personal: true } },
    orderBy: { joinedAt: "asc" },
  });
  if (existing) return existing.spaceId;
  const space = await prisma.space.create({
    data: {
      name: "Personal",
      personal: true,
      members: { create: { userId, role: "OWNER" } },
    },
  });
  return space.id;
}

export async function requireSpace(): Promise<ActiveSpace> {
  const session = await readSession();
  if (!session) redirect("/login");
  const { userId } = session;
  // same query as before, but it now also enforces session revocation
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true },
  });
  if (!user || user.sessionVersion !== session.ver) redirect("/login");

  const jar = await cookies();
  const wanted = jar.get(COOKIE)?.value;
  let membership = wanted
    ? await prisma.spaceMember.findFirst({
        where: { userId, spaceId: wanted },
        include: { space: true },
      })
    : null;

  if (!membership) {
    const personalId = await ensurePersonalSpace(userId);
    membership = await prisma.spaceMember.findFirst({
      where: { userId, spaceId: personalId },
      include: { space: true },
    });
  }

  const memberCount = await prisma.spaceMember.count({
    where: { spaceId: membership!.spaceId },
  });

  return {
    userId,
    spaceId: membership!.spaceId,
    spaceName: membership!.space.name,
    personal: membership!.space.personal,
    role: membership!.role,
    shared: memberCount > 1,
  };
}

/**
 * Structural deletes in a shared space are owner-only. Everyday money entry
 * stays open to every member; removing an account, category, debt or goal
 * destroys history for everyone, so it needs the owner.
 */
export async function requireOwner(back: string): Promise<ActiveSpace> {
  const space = await requireSpace();
  if (!space.personal && space.role !== "OWNER") {
    redirect(
      `${back}${back.includes("?") ? "&" : "?"}err=` +
        encodeURIComponent("Only the owner of this shared space can do that"),
    );
  }
  return space;
}

export async function listMySpaces(userId: string) {
  return prisma.spaceMember.findMany({
    where: { userId },
    include: { space: { include: { _count: { select: { members: true } } } } },
    orderBy: [{ space: { personal: "desc" } }, { joinedAt: "asc" }],
  });
}

export async function setActiveSpaceCookie(spaceId: string) {
  const jar = await cookies();
  jar.set(COOKIE, spaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}
