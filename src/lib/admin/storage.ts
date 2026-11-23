import { supabase } from "@/integrations/supabase/client";

export type Bucket = "product-images" | "banner-images";
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
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
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
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
