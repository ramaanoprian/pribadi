import { supabase } from './supabase';

export function productImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('produk').getPublicUrl(path).data.publicUrl;
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

export async function uploadFile(bucket: 'produk' | 'bukti-transfer', prefix: string, file: File, maxBytes: number): Promise<string> {
  const ext = EXT[file.type];
  if (!ext) throw new Error('Format file harus JPG, PNG, atau WEBP' + (bucket === 'bukti-transfer' ? ', atau PDF.' : '.'));
  if (file.size > maxBytes) throw new Error(`Ukuran file maksimal ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}
