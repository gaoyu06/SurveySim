import { z, type ZodTypeAny } from "zod";

function unwrapSchema(schema: ZodTypeAny): { schema: ZodTypeAny; optional: boolean } {
  let current = schema;
  let optional = false;

  while (true) {
    if (current instanceof z.ZodOptional) {
      optional = true;
      current = current.unwrap();
      continue;
    }

    if (current instanceof z.ZodNullable) {
      current = current.unwrap();
      continue;
    }

    if (current instanceof z.ZodDefault) {
      optional = true;
      current = (current._def as { innerType: ZodTypeAny }).innerType;
      continue;
    }

    if (current instanceof z.ZodCatch) {
      optional = true;
      current = (current._def as { innerType: ZodTypeAny }).innerType;
      continue;
    }

    if (current instanceof z.ZodEffects) {
      current = current.innerType();
      continue;
    }

    if (current instanceof z.ZodBranded) {
      current = current.unwrap();
      continue;
    }

    break;
  }

  return { schema: current, optional };
}

function indent(text: string, level: number) {
  const prefix = "  ".repeat(level);
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function renderUnionOptions(options: ZodTypeAny[], level: number) {
  return options
    .map((option, index) => {
      return `${index + 1}. ${renderSchemaShape(option, level)}`;
    })
    .join("\n");
}

function renderObjectShape(schema: z.AnyZodObject, level: number) {
  const shape = schema.shape as Record<string, ZodTypeAny>;
  const entries = Object.entries(shape);
  if (entries.length === 0) return "{}";

  const lines = entries.map(([key, fieldSchema]) => {
    const { schema: normalized, optional } = unwrapSchema(fieldSchema);
    const label = `${key}${optional ? "?" : ""}:`;
    const rendered = renderSchemaShape(normalized, level + 1);

    if (rendered.includes("\n")) {
      return `${label}\n${indent(rendered, 1)}`;
    }

    return `${label} ${rendered}`;
  });

  return `{\n${indent(lines.join("\n"), level + 1)}\n${"  ".repeat(level)}}`;
}

function renderSchemaShape(schema: ZodTypeAny, level = 0): string {
  const { schema: normalized } = unwrapSchema(schema);

  if (normalized instanceof z.ZodString) return "string";
  if (normalized instanceof z.ZodNumber) return "number";
  if (normalized instanceof z.ZodBoolean) return "boolean";
  if (normalized instanceof z.ZodLiteral) return JSON.stringify(normalized.value);
  if (normalized instanceof z.ZodEnum) return normalized.options.map((value) => JSON.stringify(value)).join(" | ");
  if (normalized instanceof z.ZodNativeEnum) return Object.values(normalized.enum).map((value) => JSON.stringify(value)).join(" | ");
  if (normalized instanceof z.ZodArray) return `Array<${renderSchemaShape(normalized.element, level + 1)}>`;
  if (normalized instanceof z.ZodRecord) return `{ [key: string]: ${renderSchemaShape(normalized.valueSchema, level + 1)} }`;
  if (normalized instanceof z.ZodObject) return renderObjectShape(normalized, level);
  if (normalized instanceof z.ZodUnion) return `One of:\n${indent(renderUnionOptions(normalized._def.options, level + 1), level + 1)}`;
  if (normalized instanceof z.ZodDiscriminatedUnion) {
    return `One of:\n${indent(renderUnionOptions(Array.from(normalized.options.values()), level + 1), level + 1)}`;
  }
  if (normalized instanceof z.ZodLazy) {
    return renderSchemaShape(normalized.schema, level);
  }
  if (normalized instanceof z.ZodAny || normalized instanceof z.ZodUnknown) return "any";
  if (normalized instanceof z.ZodNull) return "null";

  return normalized._def.typeName.replace(/^Zod/, "").toLowerCase();
}

export function renderSchemaGuide(name: string, schema: ZodTypeAny) {
  return `${name} = ${renderSchemaShape(schema)}`;
}

export function renderEnumValues(schema: z.ZodEnum<[string, ...string[]]>) {
  return schema.options.map((value) => JSON.stringify(value)).join(", ");
}

export function buildJsonFixerPrompt(targetName: string, schema: ZodTypeAny) {
  return [
    `Return valid JSON only for ${targetName}.`,
    "Do not include markdown fences or explanations.",
    renderSchemaGuide(targetName, schema),
  ].join("\n");
}
