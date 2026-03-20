import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

export async function writeTextFile(filePath: string, content: string) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, content, "utf-8");
}
