"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";
import { getSessionUserId } from "@/lib/auth";
import {
  aiExtractTransactions,
  extractFileText,
  fileToImageInput,
  imageExtension,
  importRowSchema,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  type AIInput,
} from "@/lib/importer";



export async function startImport(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/import?err=" + encodeURIComponent("Please choose a file"));
  }
  const f = file as File;
  const isImage = imageExtension(f.name) !== null;
  if (f.size > (isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES)) {
    redirect(
      "/import?err=" +
        encodeURIComponent(isImage ? "Image is too large — max 5 MB" : "File is too large — max 2 MB"),
    );
  }

  let input: AIInput;
  if (isImage) {
    input = await fileToImageInput(f);
  } else {
    let text = "";
    try {
      text = await extractFileText(f);
    } catch (e) {
      redirect("/import?err=" + encodeURIComponent((e as Error).message));
    }
    if (text.trim().length < 40) {
      redirect(
        "/import?err=" +
          encodeURIComponent(
            "Could not read text from this file. For scanned PDFs, take a screenshot and upload it as an image instead.",
          ),
      );
    }
    input = { kind: "text", text };
  }

  const [categories, accounts] = await Promise.all([
    prisma.category.findMany({ where: { spaceId } }),
    prisma.finAccount.findMany({ where: { spaceId, archived: false } }),
  ]);

  let rows;
  try {
    rows = await aiExtractTransactions(
      input,
      categories.map((c) => c.name),
      accounts.map((a) => a.name),
    );
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 429) {
      redirect(
        "/import?err=" +
          encodeURIComponent(
            "Your OpenAI account has no API credit. Add credit at platform.openai.com/settings/organization/billing, then try again.",
          ),
      );
    }
    if (status === 401) {
      redirect("/import?err=" + encodeURIComponent("OpenAI API key is invalid — check OPENAI_API_KEY"));
    }
    redirect("/import?err=" + encodeURIComponent("The AI could not process this file. Try again."));
  }
  if (!rows || rows.length === 0) {
    redirect("/import?err=" + encodeURIComponent("No transactions found in this file"));
  }

  const batch = await prisma.importBatch.create({
    data: { userId, spaceId, fileName: f.name, rows: rows as object[] },
  });
  redirect(`/import/${batch.id}`);
}

const confirmSchema = z.array(
  importRowSchema.extend({
    include: z.boolean(),
    accountName: z.string().trim().min(1).max(40),
    categoryName: z.string().trim().max(40),
  }),
);

export async function confirmImport(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const batchId = String(formData.get("batchId") ?? "");
  const batch = await prisma.importBatch.findFirst({ where: { id: batchId, userId } });
  if (!batch) redirect("/import?err=" + encodeURIComponent("Import not found"));
  if (batch!.status === "DONE") {
    redirect("/money?tab=history&ok=" + encodeURIComponent("This file was already imported"));
  }

  let rows;
  try {
    rows = confirmSchema.parse(JSON.parse(String(formData.get("rows") ?? "[]")));
  } catch {
    redirect(`/import/${batchId}?err=` + encodeURIComponent("Some rows are invalid — check dates and amounts"));
  }
  const selected = rows!.filter((r) => r.include);
  if (selected.length === 0) {
    redirect(`/import/${batchId}?err=` + encodeURIComponent("No rows selected"));
  }

  const [accounts, categories] = await Promise.all([
    prisma.finAccount.findMany({ where: { spaceId } }),
    prisma.category.findMany({ where: { spaceId } }),
  ]);
  const accountByName = new Map(accounts.map((a) => [a.name.toLowerCase(), a]));
  const categoryByName = new Map(categories.map((c) => [`${c.name.toLowerCase()}|${c.type}`, c]));

  let imported = 0;
  let duplicates = 0;

  await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.importBatch.updateMany({
        where: { id: batchId, status: "DRAFT" },
        data: { status: "DONE" },
      });
      if (claimed.count === 0) return;

      for (const r of selected) {
        let account = accountByName.get(r.accountName.toLowerCase());
        if (!account) {
          account = await tx.finAccount.create({
            data: { userId, spaceId, name: r.accountName, type: "BANK", balance: 0n },
          });
          accountByName.set(r.accountName.toLowerCase(), account);
        }

        let categoryId: string | null = null;
        if (r.categoryName) {
          const type = r.direction === "IN" ? "INCOME" : "EXPENSE";
          const key = `${r.categoryName.toLowerCase()}|${type}`;
          let category = categoryByName.get(key);
          if (!category) {
            category = await tx.category.create({
              data: {
                userId,
                spaceId,
                name: r.categoryName,
                type,
                icon: r.direction === "IN" ? "💰" : "🏷️",
              },
            });
            categoryByName.set(key, category);
          }
          categoryId = category.id;
        }

        const date = new Date(r.date + "T08:00:00Z");
        const dupe = await tx.transaction.findFirst({
          where: {
            spaceId,
            accountId: account.id,
            date,
            amount: BigInt(r.amount),
            direction: r.direction,
            note: r.note,
          },
        });
        if (dupe) {
          duplicates++;
          continue;
        }

        await tx.transaction.create({
          data: {
            userId,
            spaceId,
            accountId: account.id,
            categoryId,
            date,
            amount: BigInt(r.amount),
            direction: r.direction,
            note: r.note,
            importBatchId: batchId,
          },
        });
        await tx.finAccount.update({
          where: { id: account.id },
          data: {
            balance: { [r.direction === "IN" ? "increment" : "decrement"]: BigInt(r.amount) },
          },
        });
        imported++;
      }
    },
    { timeout: 30_000 },
  );

  revalidatePath("/", "layout");
  const msg =
    `Imported ${imported} transaction${imported === 1 ? "" : "s"}` +
    (duplicates > 0 ? ` — ${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped` : "") +
    " 📄✨ (undo anytime from the Import page)";
  redirect("/money?tab=history&ok=" + encodeURIComponent(msg) + "&fx=paid");
}

export async function undoImport(formData: FormData) {
  const { userId, spaceId } = await requireSpace();
  const batchId = String(formData.get("batchId") ?? "");
  const batch = await prisma.importBatch.findFirst({ where: { id: batchId, userId } });
  if (!batch || batch.status !== "DONE") {
    redirect("/import?err=" + encodeURIComponent("This import cannot be undone"));
  }
  let reverted = 0;
  await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.importBatch.updateMany({
        where: { id: batchId, status: "DONE" },
        data: { status: "REVERTED" },
      });
      if (claimed.count === 0) return;
      const txs = await tx.transaction.findMany({ where: { spaceId, importBatchId: batchId } });
      for (const t of txs) {
        const effect = t.direction === "IN" ? t.amount : -t.amount;
        await tx.finAccount.update({
          where: { id: t.accountId },
          data: { balance: { decrement: effect } },
        });
        await tx.debtPayment.updateMany({
          where: { transactionId: t.id },
          data: { transactionId: null },
        });
        await tx.transaction.delete({ where: { id: t.id } });
        reverted++;
      }
    },
    { timeout: 30_000 },
  );
  revalidatePath("/", "layout");
  redirect(
    "/import?ok=" +
      encodeURIComponent(`Import undone — ${reverted} transactions removed, balances restored`),
  );
}
