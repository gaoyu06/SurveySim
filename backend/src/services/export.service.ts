import path from "node:path";
import { stringify } from "csv-stringify/sync";
import type { ParticipantIdentity, StructuredAnswer } from "@formagents/shared";
import { prisma } from "../lib/db.js";
import { fromJson } from "../lib/json.js";
import { env } from "../config/env.js";
import { ensureDir, writeTextFile } from "../utils/fs.js";
import { ReportService } from "./reporting/report.service.js";

export class ExportService {
  private readonly reportService = new ReportService();

  async exportJson(userId: string, runId: string) {
    const payload = await this.buildPayload(userId, runId);
    const filePath = path.resolve(env.STORAGE_DIR, "exports", `${runId}.json`);
    await writeTextFile(filePath, JSON.stringify(payload, null, 2));
    return { filePath, payload };
  }

  async exportCsv(userId: string, runId: string) {
    const payload = await this.buildPayload(userId, runId);
    const rows = payload.participants.flatMap((participant) =>
      participant.answers.map((answer) => ({
        runId: payload.run.id,
        runName: payload.run.name,
        participantOrdinal: participant.ordinal,
        identity: JSON.stringify(participant.identity),
        personaPrompt: participant.personaPrompt,
        questionId: answer.questionId,
        selectedOptionIds: answer.selectedOptionIds.join("|"),
        otherText: answer.otherText ?? "",
        ratingValue: answer.ratingValue ?? "",
        textAnswer: answer.textAnswer ?? "",
      })),
    );
    const csv = stringify(rows, { header: true });
    const filePath = path.resolve(env.STORAGE_DIR, "exports", `${runId}.csv`);
    await writeTextFile(filePath, csv);
    return { filePath, csv };
  }

  async exportHtml(userId: string, runId: string) {
    const report = await this.reportService.getReport(userId, runId, {});
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>FormAgents Report ${runId}</title>
  <style>
    body { font-family: Georgia, serif; padding: 32px; background: #f7f3ed; color: #1b1a17; }
    h1, h2 { margin-bottom: 8px; }
    .card { background: white; border-radius: 16px; padding: 20px; margin-bottom: 20px; box-shadow: 0 10px 30px rgba(0,0,0,.06); }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #ddd; padding: 8px 6px; text-align: left; }
  </style>
</head>
<body>
  <h1>FormAgents Report</h1>
  <p>Run ID: ${report.runId}</p>
  <p>Total Responses: ${report.totalResponses}</p>
  ${report.questions
    .map((question) => `<section class="card"><h2>${question.title}</h2><pre>${JSON.stringify(question, null, 2)}</pre></section>`)
    .join("\n")}
</body>
</html>`;
    const filePath = path.resolve(env.STORAGE_DIR, "reports", `${runId}.html`);
    await ensureDir(path.dirname(filePath));
    await writeTextFile(filePath, html);
    return { filePath, html };
  }

  private async buildPayload(userId: string, runId: string) {
    const run = await prisma.mockRun.findFirst({
      where: { id: runId, userId },
      include: {
        participantInstances: {
          include: {
            personaProfile: true,
            surveyResponse: { include: { answers: true } },
          },
          orderBy: { ordinal: "asc" },
        },
      },
    });

    if (!run) throw new Error("Mock run not found");

    return {
      run: {
        id: run.id,
        name: run.name,
        status: run.status,
        createdAt: run.createdAt,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
      },
      participants: run.participantInstances.map((participant) => ({
        id: participant.id,
        ordinal: participant.ordinal,
        identity: fromJson<ParticipantIdentity>(participant.identity),
        personaPrompt: participant.personaProfile?.promptText ?? "",
        answers: (participant.surveyResponse?.answers ?? []).map((answer) => fromJson<StructuredAnswer>(answer.answer)),
      })),
    };
  }
}
