import mascote from "@/assets/logo-mascote.png.asset.json";

export function ProductImage({ src, alt, eager }: { src?: string | null; alt: string; eager?: boolean }) {
  if (src) {
    return (
      <div className="aspect-square w-full overflow-hidden bg-card">
        <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} className="size-full object-contain" />
      </div>
    );
  }
  return (
    <div className="grid aspect-square w-full place-items-center bg-muted">
      <img src={mascote.url} alt={alt} width={210} height={197} loading={eager ? "eager" : "lazy"} className="w-1/2 opacity-40 grayscale mix-blend-multiply" />
    </div>
  );
}
