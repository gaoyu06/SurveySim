import path from "node:path";
import WordExtractor from "word-extractor";

const wordExtractor = new WordExtractor();

const plainTextExtensions = new Set([".txt", ".md", ".csv", ".json"]);
const wordExtensions = new Set([".doc", ".docx"]);

const plainTextMimeTypes = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/ld+json",
]);

const wordMimeTypeToExtension = new Map<string, ".doc" | ".docx">([
  ["application/msword", ".doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
]);

export interface ImportDocumentParseInput {
  buffer: Buffer;
  filename?: string;
  mimeType?: string;
}

export interface ParsedImportDocument {
  rawText: string;
  detectedFormat: string;
}

function normalizeExtractedText(text: string) {
  return text.replace(/\u0000/g, "").replace(/\r\n?/g, "\n").trim();
}

function resolveExtension(filename?: string, mimeType?: string) {
  const filenameExtension = filename ? path.extname(filename).toLowerCase() : "";
  if (filenameExtension) {
    return filenameExtension;
  }

  return mimeType ? wordMimeTypeToExtension.get(mimeType.toLowerCase()) ?? "" : "";
}

function parsePlainText(buffer: Buffer) {
  return normalizeExtractedText(buffer.toString("utf-8"));
}

async function parseWordDocument(buffer: Buffer) {
  const document = await wordExtractor.extract(buffer);
  return normalizeExtractedText(document.getBody());
}

function ensureExtractedText(rawText: string, extension: string) {
  if (!rawText) {
    throw new Error(`Failed to extract readable text from ${extension} file`);
  }
  return rawText;
}

export async function parseImportDocument(input: ImportDocumentParseInput): Promise<ParsedImportDocument> {
  const extension = resolveExtension(input.filename, input.mimeType);
  const normalizedMimeType = input.mimeType?.toLowerCase();

  if (plainTextExtensions.has(extension) || (!!normalizedMimeType && plainTextMimeTypes.has(normalizedMimeType))) {
    const rawText = ensureExtractedText(parsePlainText(input.buffer), extension || "text");
    return {
      rawText,
      detectedFormat: extension || normalizedMimeType || "text",
    };
  }

  if (wordExtensions.has(extension)) {
    try {
      const rawText = ensureExtractedText(await parseWordDocument(input.buffer), extension);
      return {
        rawText,
        detectedFormat: extension,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to extract readable text from ${extension} file: ${message}`);
    }
  }

  throw new Error(
    `Unsupported import format: ${extension || normalizedMimeType || "unknown"}. Supported formats: .txt, .md, .csv, .json, .doc, .docx`,
  );
}
