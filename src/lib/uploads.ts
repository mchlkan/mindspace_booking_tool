import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export class UploadError extends Error {}

/**
 * Stores an uploaded image and returns its public URL.
 *  - BLOB_READ_WRITE_TOKEN set → Vercel Blob
 *  - otherwise, locally → ./.uploads, served at /media/…
 *  - on Vercel without Blob → refused with a clear message
 * Returns null when no file was chosen.
 */
export async function saveImage(file: FormDataEntryValue | null, folder: "banners" | "photos"): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  const ext = TYPES[file.type];
  if (!ext) throw new UploadError("Please upload a JPG, PNG or WebP image.");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("That image is too large (max 3 MB).");
  const name = `${folder}/${nanoid(16)}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(name, file, { access: "public", contentType: file.type });
    return blob.url;
  }
  if (process.env.VERCEL) {
    throw new UploadError("Image uploads aren't set up yet. Add Vercel Blob storage to the project.");
  }
  await mkdir(path.join(process.cwd(), ".uploads", folder), { recursive: true });
  await writeFile(path.join(process.cwd(), ".uploads", name), Buffer.from(await file.arrayBuffer()));
  return `/media/${name}`;
}

/** Reads a locally stored upload (for the /media route in development). */
export async function readLocalUpload(parts: string[]) {
  const rel = parts.join("/");
  if (!/^(banners|photos)\/[\w-]{16}\.(jpg|png|webp)$/.test(rel)) return null;
  try {
    // A fixed folder, so the bundler doesn't trace (and deploy) the whole project.
    const data = await readFile(path.join(process.cwd(), ".uploads", rel));
    const ext = rel.split(".").pop()!;
    return { data, type: ext === "jpg" ? "image/jpeg" : `image/${ext}` };
  } catch {
    return null;
  }
}
