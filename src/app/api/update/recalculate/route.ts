import { prisma } from "@/lib/db";
import { getWeights, calculateBreakdown, calculateTotalScore } from "@/lib/scoring";

export async function POST() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const chefs = await prisma.chef.findMany({
          where: { isArchived: false },
          include: {
            accolades: true,
            careerEntries: true,
            recognitions: true,
            publicSignals: true,
            peerStandings: true,
          },
        });

        const total = chefs.length;
        const weights = await getWeights();

        send({ type: "progress", current: 0, total, message: "Calculating scores..." });

        const scored = chefs.map((chef, i) => {
          if (i % 10 === 0) {
            // Can't send mid-map since it's sync, but we'll send after
          }
          const breakdown = calculateBreakdown(chef);
          const totalScore = calculateTotalScore(breakdown, weights);
          return { id: chef.id, name: chef.name, total: totalScore, breakdown };
        });

        scored.sort((a, b) => b.total - a.total);

        send({ type: "progress", current: Math.floor(total * 0.5), total, message: "Updating ranks..." });

        for (let i = 0; i < scored.length; i++) {
          await prisma.chef.update({
            where: { id: scored[i].id },
            data: { totalScore: scored[i].total, rank: i + 1 },
          });

          if (i % 10 === 0) {
            send({ type: "progress", current: Math.floor(total * 0.5) + Math.floor((i / scored.length) * total * 0.5), total, message: `Updating rank ${i + 1} of ${scored.length}...` });
          }
        }

        const top3 = scored.slice(0, 3).map((s, i) => `${i + 1}. ${s.name} (${s.total.toFixed(1)})`).join(", ");
        const resultSummary = `Scored ${scored.length} chefs. Top 3: ${top3}`;

        await prisma.updateStepLog.create({
          data: { stepName: "score_recalculation", status: "success", resultSummary, itemsAffected: scored.length },
        });

        send({ type: "complete", resultSummary, itemsAffected: scored.length });
      } catch (err) {
        const msg = (err as Error).message;
        await prisma.updateStepLog.create({
          data: { stepName: "score_recalculation", status: "error", resultSummary: msg },
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
