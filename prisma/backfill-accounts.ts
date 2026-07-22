import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const spaces = await prisma.space.findMany();
  for (const sp of spaces) {
    const accounts = await prisma.finAccount.findMany({
      where: { spaceId: sp.id },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }],
    });
    if (!accounts.length) continue;
    for (let i = 0; i < accounts.length; i++) {
      await prisma.finAccount.update({ where: { id: accounts[i].id }, data: { sortOrder: i } });
    }
    const hasPrimary = accounts.some((a) => a.primary);
    if (!hasPrimary) {
      const first = accounts.find((a) => !a.archived) ?? accounts[0];
      await prisma.finAccount.update({ where: { id: first.id }, data: { primary: true } });
    }
    console.log(`${sp.name}: ${accounts.length} ordered, main = ${(accounts.find((a) => a.primary) ?? accounts[0]).name}`);
  }
}
main().finally(() => prisma.$disconnect());
