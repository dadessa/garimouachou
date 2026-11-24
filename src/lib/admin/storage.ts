import { createElement, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Bucket = "product-images" | "banner-images";
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_BYTES = 5 * 1024 * 1024;

export function imageProblem(file: File): string | null {
  if (!TYPES[file.type]) return "Use uma imagem JPG, PNG ou WebP.";
  if (file.size > MAX_BYTES) return "A imagem precisa ter no máximo 5 MB.";
  return null;
}

/** Envia a imagem e devolve o endereço público servido pelo site (/img/...). */
export async function uploadImage(bucket: Bucket, file: File): Promise<string> {
  const problem = imageProblem(file);
  if (problem) throw new Error(problem);
  const path = `${crypto.randomUUID()}.${TYPES[file.type]}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("Não foi possível enviar a imagem. Tente de novo.");
  return `/img/${bucket}/${path}`;
}

/** Extrai o caminho no storage de um endereço /img/<bucket>/<arquivo>; null para imagens de fora. */
export function storagePath(url: string | null | undefined, bucket: Bucket): string | null {
  const prefix = `/img/${bucket}/`;
  return url?.startsWith(prefix) ? url.slice(prefix.length) : null;
}

export async function removeImages(bucket: Bucket, urls: (string | null | undefined)[]) {
  const paths = urls.map((u) => storagePath(u, bucket)).filter((p): p is string => !!p);
  if (!paths.length) return;
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) throw new Error("Não foi possível excluir as imagens.");
}

/** Tempo de validade dos links temporários de pré-visualização no painel. */
export const PREVIEW_TTL_S = 60 * 10;

/** Link temporário (só administradoras conseguem gerar, pela regra do armazenamento). */
export function useAdminImageUrl(url: string | null | undefined): string | null {
  const path = storagePath(url, "product-images") ?? null;
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    supabase.storage
      .from("product-images")
      .createSignedUrl(path, PREVIEW_TTL_S)
      .then(({ data }) => {
        if (alive && data?.signedUrl) setSigned({ path, url: data.signedUrl });
      });
    return () => {
      alive = false;
    };
  }, [path]);
  if (!path) return url ?? null;
  return signed?.path === path ? signed.url : null;
}

export function AdminImg({ src, ...rest }: { src: string | null | undefined; alt: string; className?: string }) {
  const u = useAdminImageUrl(src);
  return u ? createElement("img", { src: u, ...rest }) : null;
}
