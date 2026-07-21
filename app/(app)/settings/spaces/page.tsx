import Link from "next/link";
import { prisma } from "@/lib/db";
import { listMySpaces, requireSpace } from "@/lib/space";
import {
  acceptInvite,
  cancelInvite,
  createSpace,
  declineInvite,
  deleteSpace,
  inviteToSpace,
  leaveSpace,
  removeMember,
  renameSpace,
  switchSpace,
} from "@/app/spaces/actions";
import Popover from "@/components/Popover";
import SubmitButton from "@/components/SubmitButton";

export default async function SpacesPage() {
  const { userId, spaceId } = await requireSpace();
  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    listMySpaces(userId),
  ]);
  const [myInvites, activeMembers, activeInvites, activeSpace] = await Promise.all([
    prisma.spaceInvite.findMany({
      where: { email: user?.email ?? "", expiresAt: { gt: new Date() } },
      include: { space: true },
    }),
    prisma.spaceMember.findMany({
      where: { spaceId },
      include: { user: true },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.spaceInvite.findMany({ where: { spaceId } }),
    prisma.space.findUnique({ where: { id: spaceId } }),
  ]);
  const iAmOwner = activeMembers.some((m) => m.userId === userId && m.role === "OWNER");

  return (
    <div className="max-w-md">
      <Link href="/settings" className="text-xs font-bold text-sagedeep">
        ‹ Settings
      </Link>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-1">Spaces</h1>
      <p className="text-sm text-inksoft mb-5">
        A space holds one set of money data. Your personal space is private. Create a shared space
        to track money together with someone — each space keeps its own accounts, debts, and plan.
      </p>

      {myInvites.length > 0 && (
        <div className="bg-goodbg border border-sagedeep/30 rounded-lg p-4 mb-5">
          <h2 className="text-sm font-bold text-sagedeep mb-2">You have invitations 👥</h2>
          <div className="space-y-2">
            {myInvites.map((i) => (
              <div key={i.id} className="flex items-center gap-2">
                <span className="flex-1 text-[13px] font-semibold">{i.space.name}</span>
                <form action={acceptInvite}>
                  <input type="hidden" name="id" value={i.id} />
                  <SubmitButton
                    className="bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold px-3 py-1.5"
                    pendingText="Joining…"
                  >
                    Join
                  </SubmitButton>
                </form>
                <form action={declineInvite}>
                  <input type="hidden" name="id" value={i.id} />
                  <button className="text-[11px] font-extrabold text-inksoft px-2">Decline</button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="text-sm font-bold mb-2">Your spaces</h2>
      <div className="space-y-2 mb-5">
        {memberships.map((m) => {
          const active = m.spaceId === spaceId;
          return (
            <div
              key={m.id}
              className={`bg-card border rounded-lg p-3.5 flex items-center gap-3 ${
                active ? "border-sagedeep" : "border-line"
              }`}
            >
              <span className="text-lg">{m.space.personal ? "🔒" : "👥"}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-[13.5px] truncate">{m.space.name}</div>
                <div className="text-[11px] text-inksoft">
                  {m.space.personal
                    ? "private"
                    : `${m.space._count.members} ${m.space._count.members === 1 ? "member" : "members"}`}{" "}
                  ·{" "}
                  {m.role.toLowerCase()}
                </div>
              </div>
              {active ? (
                <span className="bg-goodbg text-good rounded-full text-[11px] font-extrabold px-3 py-1.5">
                  Active
                </span>
              ) : (
                <form action={switchSpace}>
                  <input type="hidden" name="spaceId" value={m.spaceId} />
                  <SubmitButton
                    className="border border-line text-sagedeep rounded-full text-[11px] font-extrabold px-3 py-1.5"
                    pendingText="…"
                  >
                    Switch
                  </SubmitButton>
                </form>
              )}
            </div>
          );
        })}
      </div>

      <details className="mb-6">
        <summary className="text-xs font-bold text-sagedeep cursor-pointer">
          + Create a shared space
        </summary>
        <form action={createSpace} className="bg-card border border-line rounded-md p-3.5 mt-2 space-y-2">
          <input
            name="name"
            required
            maxLength={40}
            placeholder="Household, Trip with friends, …"
            className="w-full rounded-md border border-line bg-cream2 px-3.5 py-2.5 text-sm"
          />
          <SubmitButton
            className="rounded-full bg-sagedeep text-cream2 text-xs font-extrabold px-5 py-2.5"
            pendingText="Creating…"
          >
            Create space
          </SubmitButton>
          <p className="text-[10.5px] text-inksoft">
            It starts empty with basic categories. Your personal data stays private.
          </p>
        </form>
      </details>

      {!activeSpace?.personal && (
        <>
          <h2 className="text-sm font-bold mb-2">People in “{activeSpace?.name}”</h2>
          <div className="space-y-2 mb-3">
            {activeMembers.map((m) => (
              <div key={m.id} className="bg-card border border-line rounded-md px-3.5 py-2.5 flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-sage text-white font-extrabold text-xs flex items-center justify-center">
                  {m.user.name[0]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[13px] truncate">
                    {m.user.name}
                    {m.userId === userId && " (you)"}
                  </div>
                  <div className="text-[11px] text-inksoft truncate">{m.user.email}</div>
                </div>
                <span className="text-[10.5px] font-bold text-inksoft uppercase">{m.role}</span>
                {iAmOwner && m.role !== "OWNER" && (
                  <form action={removeMember}>
                    <input type="hidden" name="spaceId" value={spaceId} />
                    <input type="hidden" name="memberId" value={m.id} />
                    <button className="text-bad font-extrabold px-1" title="Remove">
                      ✕
                    </button>
                  </form>
                )}
              </div>
            ))}
            {activeInvites.map((i) => (
              <div key={i.id} className="bg-warnbg/50 border border-line rounded-md px-3.5 py-2.5 flex items-center gap-3">
                <span className="text-base">✉️</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] truncate">{i.email}</div>
                  <div className="text-[11px] text-inksoft">invitation pending</div>
                </div>
                {iAmOwner && (
                  <form action={cancelInvite}>
                    <input type="hidden" name="id" value={i.id} />
                    <button className="text-bad font-extrabold px-1" title="Cancel invitation">
                      ✕
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>

          {iAmOwner && (
            <form action={inviteToSpace} className="bg-card border border-line rounded-md p-3.5 mb-4 space-y-2">
              <input type="hidden" name="spaceId" value={spaceId} />
              <label className="block text-xs font-semibold text-inksoft">Invite by email</label>
              <input
                name="email"
                type="email"
                required
                placeholder="partner@example.com"
                className="w-full rounded-md border border-line bg-cream2 px-3.5 py-2.5 text-sm"
              />
              <SubmitButton
                className="rounded-full bg-sagedeep text-cream2 text-xs font-extrabold px-5 py-2.5"
                pendingText="Inviting…"
              >
                Send invitation
              </SubmitButton>
            </form>
          )}

          <div className="flex gap-2">
            {iAmOwner ? (
              <>
                <Popover trigger="Rename space" triggerClass="border border-line text-earth rounded-full text-[11px] font-extrabold px-3.5 py-2" width="w-64">
                  <form action={renameSpace} className="space-y-2">
                    <input type="hidden" name="spaceId" value={spaceId} />
                    <input
                      name="name"
                      defaultValue={activeSpace?.name}
                      required
                      maxLength={40}
                      className="w-full rounded-md border border-line bg-cream2 px-3 py-2 text-sm"
                    />
                    <button className="w-full bg-sagedeep text-cream2 rounded-full text-[11px] font-extrabold py-2">
                      Save
                    </button>
                  </form>
                </Popover>
                <Popover trigger="Delete space" triggerClass="border border-bad text-bad rounded-full text-[11px] font-extrabold px-3.5 py-2" width="w-64">
                  <p className="text-[11.5px] text-bad">
                    This deletes the shared space and everything inside it for everyone. Your
                    personal space is not affected.
                  </p>
                  <form action={deleteSpace}>
                    <input type="hidden" name="spaceId" value={spaceId} />
                    <SubmitButton
                      className="w-full bg-bad text-white rounded-full text-[11px] font-extrabold py-2"
                      pendingText="Deleting…"
                    >
                      Delete “{activeSpace?.name}” forever
                    </SubmitButton>
                  </form>
                </Popover>
              </>
            ) : (
              <form action={leaveSpace}>
                <input type="hidden" name="spaceId" value={spaceId} />
                <SubmitButton
                  className="border border-bad text-bad rounded-full text-[11px] font-extrabold px-3.5 py-2"
                  pendingText="Leaving…"
                >
                  Leave this space
                </SubmitButton>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
