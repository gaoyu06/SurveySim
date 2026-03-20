import { writeFile } from "node:fs/promises";
import type { FastifyReply, FastifyRequest } from "fastify";
import { SurveyService } from "../services/survey.service.js";
import { prisma } from "../lib/db.js";
import path from "node:path";
import { env } from "../config/env.js";
import { ensureDir } from "../utils/fs.js";

export function surveyControllerFactory(service: SurveyService) {
  return {
    list: async (request: FastifyRequest, reply: FastifyReply) => {
      reply.send(await service.list(request.authUser!.id));
    },
    get: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        reply.send(await service.get(request.authUser!.id, request.params.id));
      } catch (error) {
        reply.code(404).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    importDraft: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        let body = request.body as Record<string, unknown> | undefined;
        if (request.isMultipart()) {
          const file = await request.file();
          if (!file) throw new Error("No file uploaded");
          const buffer = await file.toBuffer();
          const targetDir = path.resolve(env.STORAGE_DIR, "uploads");
          await ensureDir(targetDir);
          const filePath = path.join(targetDir, `${Date.now()}-${file.filename}`);
          await writeFile(filePath, buffer);
          await prisma.storedFile.create({
            data: {
              userId: request.authUser!.id,
              kind: "survey-upload",
              originalName: file.filename,
              mimeType: file.mimetype,
              size: buffer.length,
              path: filePath,
            },
          });
          body = {
            rawText: buffer.toString("utf-8"),
            title: file.filename,
            llmConfigId: file.fields.llmConfigId && "value" in file.fields.llmConfigId ? String(file.fields.llmConfigId.value) : undefined,
          };
        }
        reply.send(await service.importDraft(request.authUser!.id, body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    create: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        reply.send(await service.create(request.authUser!.id, request.body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    update: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        reply.send(await service.update(request.authUser!.id, request.params.id, request.body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}
