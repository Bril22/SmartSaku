import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getSessionUserId } from "./auth";

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
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const exists = await prisma.user.count({ where: { id: userId } });
  if (exists === 0) redirect("/login");

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
