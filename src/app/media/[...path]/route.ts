import { readLocalUpload } from "@/lib/uploads";

/** Serves images uploaded locally in development (production uses Vercel Blob URLs). */
export async function GET(_req: Request, ctx: RouteContext<"/media/[...path]">) {
  const { path } = await ctx.params;
  const file = await readLocalUpload(path);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: { "Content-Type": file.type, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
