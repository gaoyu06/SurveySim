import type { FastifyReply, FastifyRequest } from "fastify";
import { AdminService } from "../services/admin.service.js";

export function adminControllerFactory(service: AdminService) {
  return {
    listUsers: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        reply.send(await service.listUsers(request.authUser!));
      } catch (error) {
        reply.code(403).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    updateUser: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        reply.send(await service.updateUser(request.authUser!, request.params.id, request.body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    getSystemSettings: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        reply.send(await service.getSystemSettings(request.authUser!));
      } catch (error) {
        reply.code(403).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
    updateSystemSettings: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        reply.send(await service.updateSystemSettings(request.authUser!, request.body));
      } catch (error) {
        reply.code(400).send({ message: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}
