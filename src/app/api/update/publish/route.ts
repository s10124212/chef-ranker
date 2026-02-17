import { prisma } from "@/lib/db";
import { createMonthlySnapshot } from "@/lib/scoring";

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  const body = await req.json();
  const month = body.month;
  const notes = body.notes;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return new Response(JSON.stringify({ error: "Invalid month format" }), { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        send({ type: "progress", current: 0, total: 3, message: "Recalculating scores..." });

        const snapshotId = await createMonthlySnapshot(month, notes);

        send({ type: "progress", current: 2, total: 3, message: "Saving snapshot..." });

        const snapshot = await prisma.monthlySnapshot.findUnique({
          where: { id: snapshotId },
          include: { entries: { include: { chef: true }, orderBy: { rank: "asc" }, take: 10 } },
        });

        const entryCount = await prisma.snapshotEntry.count({ where: { snapshotId } });

        const resultSummary = `Published ${month} snapshot with ${entryCount} chefs.`;
        await prisma.updateStepLog.create({
          data: { stepName: "publish_snapshot", status: "success", resultSummary, itemsAffected: entryCount },
        });

        send({
          type: "complete",
          resultSummary,
          itemsAffected: entryCount,
          snapshotId,
          topChefs: snapshot?.entries.slice(0, 5).map((e) => ({
            name: e.chef.name,
            rank: e.rank,
            score: e.totalScore,
            delta: e.delta,
          })),
        });
      } catch (err) {
        const msg = (err as Error).message;
        await prisma.updateStepLog.create({
          data: { stepName: "publish_snapshot", status: "error", resultSummary: msg },
        }).catch(() => {});
        send({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
