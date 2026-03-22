import type { FastifyReply, FastifyRequest } from "fastify";
import { ExportService } from "../services/export.service.js";

export function exportControllerFactory(service: ExportService) {
  return {
    json: async (request: FastifyRequest<{ Params: { runId: string } }>, reply: FastifyReply) => {
      const { payload } = await service.exportJson(request.authUser!.id, request.params.runId);
      reply.header("Content-Type", "application/json");
      reply.send(payload);
    },
    csv: async (request: FastifyRequest<{ Params: { runId: string } }>, reply: FastifyReply) => {
      const { csv } = await service.exportCsv(request.authUser!.id, request.params.runId);
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.send(csv);
    },
    openTextCsv: async (request: FastifyRequest<{ Params: { runId: string } }>, reply: FastifyReply) => {
      const { csv } = await service.exportOpenTextCsv(request.authUser!.id, request.params.runId);
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.send(csv);
    },
    html: async (request: FastifyRequest<{ Params: { runId: string } }>, reply: FastifyReply) => {
      const { html } = await service.exportHtml(request.authUser!.id, request.params.runId);
      reply.header("Content-Type", "text/html; charset=utf-8");
      reply.send(html);
    },
  };
}
