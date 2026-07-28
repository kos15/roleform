import "server-only";
// @types/archiver has no default export, so the namespace import is the one
// that type-checks against the CJS module.
import * as archiver from "archiver";

/**
 * "Download all" — 6 templates × 2 formats (F9).
 *
 * Measure p95 here (M6.5). This is the most likely trigger for the job queue
 * decision in CLAUDE.md §12: twelve renders plus a zip inside one function
 * invocation is the largest single unit of work in the product.
 */
export async function zipFiles(
  files: Array<{ name: string; body: Buffer }>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new archiver.ZipArchive({ zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("warning", (e: Error) => reject(e));
    archive.on("error", (e: Error) => reject(e));
    archive.on("end", () => resolve(Buffer.concat(chunks)));

    for (const file of files) archive.append(file.body, { name: file.name });
    void archive.finalize();
  });
}
