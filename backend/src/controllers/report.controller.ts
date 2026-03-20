import type { FastifyReply, FastifyRequest } from "fastify";
import { ReportService } from "../services/reporting/report.service.js";

export function reportControllerFactory(service: ReportService) {
  return {
    getByRun: async (request: FastifyRequest<{ Params: { runId: string } }>, reply: FastifyReply) => {
      try {
        reply.send(await service.getReport(request.authUser!.id, request.params.runId, request.body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}
