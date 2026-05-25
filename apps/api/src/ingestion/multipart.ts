import busboy from "busboy";
import type { IncomingMessage } from "node:http";

export interface ParsedMultipartFile {
  filename: string;
  buffer: Buffer;
}

export async function parseMultipartSingleFile(
  req: IncomingMessage,
  maxBytes: number,
): Promise<ParsedMultipartFile> {
  return new Promise((resolve, reject) => {
    const bb = busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: maxBytes },
    });
    let buffer: Buffer | undefined;
    let filename = "upload.xlsx";
    let sawFile = false;

    bb.on("file", (_name, file, info) => {
      sawFile = true;
      filename = info.filename || filename;
      const chunks: Buffer[] = [];
      file.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      file.on("limit", () => {
        reject(Object.assign(new Error("file_too_large"), { status: 413 }));
      });
      file.on("error", reject);
      file.on("end", () => {
        buffer = Buffer.concat(chunks);
      });
    });

    bb.on("error", reject);
    bb.on("finish", () => {
      if (!sawFile || !buffer) {
        reject(Object.assign(new Error("file_required"), { status: 400 }));
        return;
      }
      resolve({ filename, buffer });
    });

    req.pipe(bb);
  });
}
