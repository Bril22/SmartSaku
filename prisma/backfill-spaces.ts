import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ include: { memberships: true } });
  for (const u of users) {
    let spaceId = u.memberships[0]?.spaceId;
    if (!spaceId) {
      const space = await prisma.space.create({
        data: {
          name: "Personal",
          personal: true,
          members: { create: { userId: u.id, role: "OWNER" } },
        },
      });
      spaceId = space.id;
    }
    const where = { userId: u.id, spaceId: null };
    const [a, d, c, t, p, g, i] = await Promise.all([
      prisma.finAccount.updateMany({ where, data: { spaceId } }),
      prisma.debt.updateMany({ where, data: { spaceId } }),
      prisma.category.updateMany({ where, data: { spaceId } }),
      prisma.transaction.updateMany({ where, data: { spaceId } }),
      prisma.plannedTransaction.updateMany({ where, data: { spaceId } }),
      prisma.goal.updateMany({ where, data: { spaceId } }),
      prisma.importBatch.updateMany({ where, data: { spaceId } }),
    ]);
    console.log(
      `${u.email} → space ${spaceId}: accounts ${a.count}, debts ${d.count}, categories ${c.count}, tx ${t.count}, planned ${p.count}, goals ${g.count}, imports ${i.count}`,
    );
  }
}
main().finally(() => prisma.$disconnect());
