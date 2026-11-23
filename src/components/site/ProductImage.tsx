import mascote from "@/assets/logo-mascote.png.asset.json";

/** Etapa 1: imagem ilustrativa (mascote) no lugar da foto real do produto. */
export function ProductImage({ alt, eager }: { alt: string; eager?: boolean }) {
  return (
    <div className="grid aspect-square w-full place-items-center bg-muted">
      <img src={mascote.url} alt={alt} width={210} height={197} loading={eager ? "eager" : "lazy"} className="w-1/2 opacity-40 grayscale mix-blend-multiply" />
    </div>
  );
}
