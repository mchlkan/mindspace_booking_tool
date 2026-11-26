/** Local image uploads (development storage; production uses Vercel Blob). */
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { readLocalUpload, saveImage, UploadError } from "@/lib/uploads";

const saved: string[] = [];
after(async () => {
  for (const url of saved) await rm(path.join(process.cwd(), ".uploads", url.replace("/media/", "")), { force: true });
});

test("saves a JPEG locally and serves it back at /media/…", async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const url = await saveImage(new File([bytes], "photo.jpg", { type: "image/jpeg" }), "banners");
  assert.ok(url);
  saved.push(url);
  assert.match(url, /^\/media\/banners\/[\w-]{16}\.jpg$/);
  const back = await readLocalUpload(url.replace("/media/", "").split("/"));
  assert.equal(back?.type, "image/jpeg");
  assert.deepEqual(new Uint8Array(back!.data), bytes);
});

test("no file chosen → nothing saved", async () => {
  assert.equal(await saveImage(null, "photos"), null);
  assert.equal(await saveImage(new File([], "empty.jpg", { type: "image/jpeg" }), "photos"), null);
});

test("rejects non-images and files over 3 MB", async () => {
  await assert.rejects(saveImage(new File(["x"], "a.pdf", { type: "application/pdf" }), "photos"), UploadError);
  const big = new File([new Uint8Array(3 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });
  await assert.rejects(saveImage(big, "photos"), UploadError);
});

test("the media route can't be used to read other files", async () => {
  assert.equal(await readLocalUpload(["..", "package.json"]), null);
  assert.equal(await readLocalUpload(["banners", "../../.env"]), null);
});
