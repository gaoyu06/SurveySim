import type { Prisma } from "@prisma/client";

export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function fromJson<T>(value: unknown): T {
  return value as T;
}
