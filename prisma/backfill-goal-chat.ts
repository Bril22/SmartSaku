import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const goals = await prisma.goal.findMany({ where: { advice: { not: "" } }, include: { messages: true } });
  let n = 0;
  for (const g of goals) {
    if (g.messages.length > 0) continue;
    await prisma.goalMessage.create({
      data: { goalId: g.id, role: "AI", text: g.advice, createdAt: g.advisedAt ?? g.createdAt },
    });
    n++;
  }
  console.log(`moved ${n} existing advice note(s) into the chat`);
}
main().finally(() => prisma.$disconnect());
