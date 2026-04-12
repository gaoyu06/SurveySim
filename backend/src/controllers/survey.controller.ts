import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { SurveyService } from "../services/survey.service.js";
import { prisma } from "../lib/db.js";
import path from "node:path";
import { env } from "../config/env.js";
import { ensureDir } from "../utils/fs.js";
import { resolvePagination } from "../utils/pagination.js";
import { parseImportDocument } from "../services/document-import.service.js";

const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

function sanitizeUploadFilename(filename: string | undefined) {
  const baseName = path.basename(filename || "upload.txt").trim();
  const sanitized = baseName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ");
  return sanitized || "upload.txt";
}

function buildStoredUploadFilename(originalName: string) {
  const extension = path.extname(originalName).slice(0, 16);
  return `${Date.now()}-${randomUUID()}${extension}`;
}

async function resolveImportBody(request: FastifyRequest) {
  let body = request.body as Record<string, unknown> | undefined;
  if (request.isMultipart()) {
    const file = await request.file();
    if (!file) throw new Error("No file uploaded");
    const buffer = await file.toBuffer();
    if (buffer.length > MAX_IMPORT_FILE_BYTES) {
      throw new Error(`Uploaded file is too large. Max size is ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)}MB`);
    }

    const safeFilename = sanitizeUploadFilename(file.filename);
    const parsedDocument = await parseImportDocument({
      buffer,
      filename: safeFilename,
      mimeType: file.mimetype,
    });

    const targetDir = path.resolve(env.STORAGE_DIR, "uploads");
    await ensureDir(targetDir);
    const filePath = path.join(targetDir, buildStoredUploadFilename(safeFilename));
    await writeFile(filePath, buffer);
    await prisma.storedFile.create({
      data: {
        userId: request.authUser!.id,
        kind: "content-task-upload",
        originalName: safeFilename,
        mimeType: file.mimetype,
        size: buffer.length,
        path: filePath,
      },
    });
    body = {
      rawText: parsedDocument.rawText,
      title: safeFilename,
      llmConfigId: file.fields.llmConfigId && "value" in file.fields.llmConfigId ? String(file.fields.llmConfigId.value) : undefined,
    };
  }
  return body;
}

export function surveyControllerFactory(service: SurveyService) {
  return {
    list: async (request: FastifyRequest<{ Querystring: { scope?: string; page?: string | number; pageSize?: string | number } }>, reply: FastifyReply) => {
      try {
        const pagination = resolvePagination({ page: request.query.page, pageSize: request.query.pageSize });
        reply.send(await service.list(request.authUser!, request.query.scope, pagination));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    get: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        reply.send(await service.get(request.authUser!, request.params.id));
      } catch (error) {
        reply.code(404).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    importDraft: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = await resolveImportBody(request);
        reply.send(await service.importDraft(request.authUser!, body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    generateWithAi: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        reply.send(await service.generateWithAi(request.authUser!, request.body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    importDraftStream: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = await resolveImportBody(request);
        reply.hijack();
        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        reply.raw.write(": connected\n\n");

        for await (const event of service.importDraftStream(request.authUser!, body)) {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }

        reply.raw.end();
      } catch (error) {
        if (!reply.sent) {
          reply.hijack();
          reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
        }
        reply.raw.write(`data: ${JSON.stringify({ type: "error", message: error instanceof Error ? error.message : String(error) })}\n\n`);
        reply.raw.end();
      }
    },
    retryImportRecord: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        reply.send(await service.retryImportRecord(request.authUser!, request.body));
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
    setPublic: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        reply.send(await service.setPublic(request.authUser!, request.params.id, request.body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    delete: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        reply.send(await service.delete(request.authUser!.id, request.params.id));
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
