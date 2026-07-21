"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSpace, setActiveSpaceCookie } from "@/lib/space";

const BACK = "/settings/spaces";

function back(msg: string, isError = false) {
  redirect(`${BACK}?${isError ? "err" : "ok"}=${encodeURIComponent(msg)}`);
}

export async function switchSpace(formData: FormData) {
  const { userId } = await requireSpace();
  const spaceId = String(formData.get("spaceId") ?? "");
  const member = await prisma.spaceMember.findFirst({ where: { userId, spaceId } });
  if (!member) back("You are not a member of that space", true);
  await setActiveSpaceCookie(spaceId);
  revalidatePath("/", "layout");
  redirect("/?ok=" + encodeURIComponent("Switched space"));
}

export async function createSpace(formData: FormData) {
  const { userId } = await requireSpace();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) back("Give the shared space a name", true);
  const space = await prisma.$transaction(async (tx) => {
    const created = await tx.space.create({
      data: {
        name: name.slice(0, 40),
        personal: false,
        members: { create: { userId, role: "OWNER" } },
      },
    });
    // a fresh space starts empty, but needs categories to be usable right away
    await tx.category.createMany({
      data: (
        [
          { name: "Salary", type: "INCOME", icon: "💰" },
          { name: "Food", type: "EXPENSE", icon: "🍜" },
          { name: "Rent", type: "EXPENSE", icon: "🏠" },
          { name: "Other", type: "EXPENSE", icon: "🧾" },
        ] as const
      ).map((c) => ({ userId, spaceId: created.id, ...c })),
    });
    return created;
  });
  await setActiveSpaceCookie(space.id);
  revalidatePath("/", "layout");
  redirect("/?ok=" + encodeURIComponent(`"${name}" created — you are now in this space 👥`));
}

export async function renameSpace(formData: FormData) {
  const { userId } = await requireSpace();
  const spaceId = String(formData.get("spaceId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const member = await prisma.spaceMember.findFirst({ where: { userId, spaceId, role: "OWNER" } });
  if (!member || !name) back("Only the owner can rename this space", true);
  await prisma.space.update({ where: { id: spaceId }, data: { name: name.slice(0, 40) } });
  revalidatePath("/", "layout");
  back("Space renamed");
}

export async function inviteToSpace(formData: FormData) {
  const { userId } = await requireSpace();
  const spaceId = String(formData.get("spaceId") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const member = await prisma.spaceMember.findFirst({ where: { userId, spaceId, role: "OWNER" } });
  if (!member) back("Only the owner can invite people", true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back("Enter a valid email address", true);

  const space = await prisma.space.findUnique({ where: { id: spaceId } });
  if (space?.personal) back("Your personal space cannot be shared — create a shared space", true);

  const invitee = await prisma.user.findUnique({ where: { email } });
  if (invitee) {
    const already = await prisma.spaceMember.findFirst({
      where: { spaceId, userId: invitee.id },
    });
    if (already) back(`${email} is already in this space`, true);
  }

  await prisma.spaceInvite.upsert({
    where: { spaceId_email: { spaceId, email } },
    create: {
      spaceId,
      email,
      invitedBy: userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    update: { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });
  back(
    invitee
      ? `Invitation sent — ${email} will see it in their Settings`
      : `Invitation saved — ${email} will see it when they sign up`,
  );
}

export async function cancelInvite(formData: FormData) {
  const { userId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const invite = await prisma.spaceInvite.findUnique({ where: { id } });
  if (!invite) back("Invitation not found", true);
  const member = await prisma.spaceMember.findFirst({
    where: { userId, spaceId: invite!.spaceId, role: "OWNER" },
  });
  if (!member) back("Only the owner can cancel invitations", true);
  await prisma.spaceInvite.delete({ where: { id } });
  back("Invitation cancelled");
}

export async function acceptInvite(formData: FormData) {
  const { userId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const invite = await prisma.spaceInvite.findUnique({ where: { id }, include: { space: true } });
  if (!invite || invite.email !== user?.email) back("Invitation not found", true);
  if (invite!.expiresAt < new Date()) {
    await prisma.spaceInvite.delete({ where: { id } });
    back("That invitation has expired — ask for a new one", true);
  }
  await prisma.$transaction([
    prisma.spaceMember.upsert({
      where: { spaceId_userId: { spaceId: invite!.spaceId, userId } },
      create: { spaceId: invite!.spaceId, userId, role: "MEMBER" },
      update: {},
    }),
    prisma.spaceInvite.delete({ where: { id } }),
  ]);
  await setActiveSpaceCookie(invite!.spaceId);
  revalidatePath("/", "layout");
  redirect("/?ok=" + encodeURIComponent(`You joined "${invite!.space.name}" 👥`));
}

export async function declineInvite(formData: FormData) {
  const { userId } = await requireSpace();
  const id = String(formData.get("id") ?? "");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const invite = await prisma.spaceInvite.findUnique({ where: { id } });
  if (invite && invite.email === user?.email) {
    await prisma.spaceInvite.delete({ where: { id } });
  }
  back("Invitation declined");
}

export async function removeMember(formData: FormData) {
  const { userId } = await requireSpace();
  const spaceId = String(formData.get("spaceId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const owner = await prisma.spaceMember.findFirst({ where: { userId, spaceId, role: "OWNER" } });
  if (!owner) back("Only the owner can remove people", true);
  if (owner!.id === memberId) back("The owner cannot be removed", true);
  await prisma.spaceMember.deleteMany({ where: { id: memberId, spaceId } });
  revalidatePath("/", "layout");
  back("Member removed");
}

export async function leaveSpace(formData: FormData) {
  const { userId } = await requireSpace();
  const spaceId = String(formData.get("spaceId") ?? "");
  const member = await prisma.spaceMember.findFirst({ where: { userId, spaceId } });
  if (!member) back("You are not in that space", true);
  if (member!.role === "OWNER") {
    back("You own this space — delete it instead, or transfer ownership first", true);
  }
  await prisma.spaceMember.delete({ where: { id: member!.id } });
  const personal = await prisma.spaceMember.findFirst({
    where: { userId, space: { personal: true } },
  });
  if (personal) await setActiveSpaceCookie(personal.spaceId);
  revalidatePath("/", "layout");
  redirect("/?ok=" + encodeURIComponent("You left the shared space"));
}

export async function deleteSpace(formData: FormData) {
  const { userId } = await requireSpace();
  const spaceId = String(formData.get("spaceId") ?? "");
  const owner = await prisma.spaceMember.findFirst({ where: { userId, spaceId, role: "OWNER" } });
  const space = await prisma.space.findUnique({ where: { id: spaceId } });
  if (!owner || !space) back("Only the owner can delete this space", true);
  if (space!.personal) back("Your personal space cannot be deleted", true);
  await prisma.space.delete({ where: { id: spaceId } });
  const personal = await prisma.spaceMember.findFirst({
    where: { userId, space: { personal: true } },
  });
  if (personal) await setActiveSpaceCookie(personal.spaceId);
  revalidatePath("/", "layout");
  redirect(
    "/?ok=" + encodeURIComponent(`"${space!.name}" and all of its shared data were deleted`),
  );
}
