import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import type { ImportRow } from "@/lib/importer";
import ImportPreview from "@/components/ImportPreview";

export default async function ImportPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;
  const batch = await prisma.importBatch.findFirst({ where: { id, userId } });
  if (!batch) notFound();
  if (batch.status === "DONE") {
    redirect("/money?tab=history&ok=" + encodeURIComponent("This file was already imported"));
  }

  const [accounts, categories] = await Promise.all([
    prisma.finAccount.findMany({ where: { userId, archived: false }, orderBy: { name: "asc" } }),
    prisma.category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
  ]);

  const rows = batch.rows as ImportRow[];

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/import" className="text-xs font-bold text-sagedeep">
        ‹ Upload a different file
      </Link>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-1">Review import</h1>
      <p className="text-sm text-inksoft mb-4">
        {batch.fileName} · {rows.length} transaction{rows.length === 1 ? "" : "s"} found. Fix
        anything that looks wrong, untick rows you don&apos;t want, then confirm.
      </p>
      <ImportPreview
        batchId={batch.id}
        initialRows={rows}
        accounts={accounts.map((a) => a.name)}
        categories={categories.map((c) => c.name)}
      />
    </div>
  );
}
