import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/space";
import { startImport, undoImport } from "@/app/import/actions";
import SubmitButton from "@/components/SubmitButton";

export default async function ImportPage() {
  const { userId, spaceId } = await requireSpace();
  const recent = await prisma.importBatch.findMany({
    where: { spaceId, status: { in: ["DONE", "REVERTED"] } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const txCounts = await prisma.transaction.groupBy({
    by: ["importBatchId"],
    where: { spaceId, importBatchId: { in: recent.map((b) => b.id) } },
    _count: { _all: true },
  });
  const countBy = new Map(txCounts.map((t) => [t.importBatchId, t._count._all]));
  return (
    <div className="max-w-md mx-auto">
      <Link href="/money?tab=history" className="text-xs font-bold text-sagedeep">
        ‹ History
      </Link>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-2">Import from file</h1>
      <p className="text-sm text-inksoft mb-5">
        Upload a bank statement or expense sheet — Saku-Kun reads it and turns it into
        transactions you can review before saving.
      </p>

      <div className="bg-card border border-line rounded-lg p-5 mb-4">
        <Image
          src="/brand/mascot-sorting.png"
          alt="Saku-Kun sorting coins"
          width={140}
          height={98}
          className="mx-auto mb-4"
        />
        <form action={startImport} className="space-y-3">
          <input
            type="file"
            name="file"
            required
            accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp"
            className="w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-goodbg file:text-sagedeep file:font-bold file:px-4 file:py-2.5 file:cursor-pointer"
          />
          <SubmitButton
            className="w-full rounded-full bg-sagedeep text-cream2 font-bold py-3.5 text-sm"
            pendingText="Reading your file with AI…"
          >
            Read file
          </SubmitButton>
        </form>
      </div>

      {recent.length > 0 && (
        <div className="mb-4">
          <h2 className="text-sm font-bold mb-2">Recent imports</h2>
          <div className="space-y-1.5">
            {recent.map((b) => (
              <div key={b.id} className="bg-card border border-line rounded-md px-3.5 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[13px] truncate">{b.fileName}</div>
                  <div className="text-[11px] text-inksoft">
                    {b.createdAt.toLocaleDateString("en-US", { day: "numeric", month: "short" })} ·{" "}
                    {b.status === "REVERTED" ? "undone" : `${countBy.get(b.id) ?? 0} transactions`}
                  </div>
                </div>
                {b.status === "DONE" && (countBy.get(b.id) ?? 0) > 0 && (
                  <form action={undoImport}>
                    <input type="hidden" name="batchId" value={b.id} />
                    <SubmitButton
                      className="border border-bad text-bad rounded-full text-[11px] font-extrabold px-3 py-1.5"
                      pendingText="Undoing…"
                    >
                      Undo import
                    </SubmitButton>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <ul className="text-[11.5px] text-inksoft space-y-1.5">
        <li>• Supported: Excel (.xlsx/.xls), CSV, text-based PDF (max 2 MB), and photos or screenshots (.png/.jpg/.webp, max 5 MB) — up to 300 rows.</li>
        <li>• For scanned PDFs: screenshot the page and upload the image instead.</li>
        <li>
          • The file content is sent to OpenAI to be read. Do not upload files you don&apos;t want
          processed there.
        </li>
        <li>• Nothing is saved until you review and confirm the preview.</li>
      </ul>
    </div>
  );
}
