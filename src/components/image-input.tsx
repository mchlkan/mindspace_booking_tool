"use client";

import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";

const MAX_SIDE = 1600;

/**
 * File picker that shrinks photos in the browser (max 1600 px, JPEG) before
 * upload, so phone photos of 5–10 MB upload fast and fit the server limit.
 */
export function ImageInput({
  name,
  label,
  currentUrl,
  hint,
  error,
  removeName,
  aspect = "aspect-[16/9]",
}: {
  name: string;
  label: string;
  currentUrl?: string | null;
  hint?: string;
  error?: string;
  removeName?: string;
  aspect?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const small = await shrink(file);
      const dt = new DataTransfer();
      dt.items.add(small);
      e.target.files = dt.files;
      setPreview(URL.createObjectURL(small));
      setRemoved(false);
    } catch {
      // Unreadable format (e.g. HEIC on some browsers): upload the original.
      setPreview(URL.createObjectURL(file));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <span className="font-semibold text-navy-700">{label}</span>
      <label
        className={`mt-1.5 flex ${aspect} w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-sand-400 hover:bg-cream-100 ${error ? "ring-2 ring-error" : ""}`}
      >
        {preview && !removed ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-ink-500">
            <ImagePlus className="size-8" strokeWidth={1.25} aria-hidden />
            <span className="text-sm">{busy ? "Preparing…" : "Choose a photo"}</span>
          </span>
        )}
        <input
          ref={input}
          type="file"
          name={name}
          accept="image/jpeg,image/png,image/webp,image/heic"
          onChange={onChange}
          className="sr-only"
        />
      </label>
      {removeName && preview && (
        <label className="mt-2 flex items-center gap-2 text-sm text-ink-500">
          <input
            type="checkbox"
            name={removeName}
            checked={removed}
            onChange={(e) => {
              setRemoved(e.target.checked);
              if (e.target.checked && input.current) input.current.value = "";
            }}
            className="size-4 accent-navy-500"
          />
          Remove photo
        </label>
      )}
      {error ? (
        <p className="mt-1 text-sm font-medium text-error">{error}</p>
      ) : (
        hint && <p className="mt-1 text-sm text-ink-500">{hint}</p>
      )}
    </div>
  );
}

async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.85),
  );
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}
