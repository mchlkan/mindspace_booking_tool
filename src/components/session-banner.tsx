import { Flower2, Sun } from "lucide-react";
import Image from "next/image";

type Props = {
  kind: "training" | "event";
  bannerUrl: string | null;
  /** Tint used when there's no photo (brand colour + text colour classes). */
  fallbackTint: string;
  /** Tailwind height class, e.g. "h-40". */
  heightClass: string;
  /** Load right away (above the fold) instead of lazily. */
  eager?: boolean;
};

/**
 * Activity banner: photo with a brand-navy transparent overlay so the label
 * stays readable (Brand Book p.30), or a flat brand tint + icon without one.
 */
export function SessionBanner({ kind, bannerUrl, fallbackTint, heightClass, eager }: Props) {
  const label = kind === "training" ? "Class" : "Event";

  if (!bannerUrl) {
    const KindIcon = kind === "training" ? Flower2 : Sun;
    return (
      <div className={`flex items-end justify-between px-5 pb-3 ${heightClass} ${fallbackTint}`}>
        <span className="text-xs font-semibold tracking-[0.2em] uppercase">{label}</span>
        <KindIcon className="size-10 opacity-80" strokeWidth={1.25} aria-hidden />
      </div>
    );
  }

  return (
    <div className={`relative ${heightClass} bg-navy-500`}>
      <Image
        src={bannerUrl}
        alt=""
        fill
        sizes="(max-width: 672px) 100vw, 672px"
        loading={eager ? "eager" : "lazy"}
        preload={eager}
        className="object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-navy-900/75 via-navy-700/20 to-transparent"
      />
      <span className="absolute bottom-3 left-5 text-xs font-semibold tracking-[0.2em] text-sun-300 uppercase">
        {label}
      </span>
    </div>
  );
}
