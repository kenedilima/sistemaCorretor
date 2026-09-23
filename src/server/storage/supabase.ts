import { createClient } from "@supabase/supabase-js";
import type { StorageProvider } from "./index";

export class SupabaseStorage implements StorageProvider {
  // `||`, não `??`: variável cadastrada vazia no Vercel chega como "" e viraria "Bucket not found"
  private readonly bucket = process.env.SUPABASE_BUCKET?.trim() || "property-images";
  private readonly client = (() => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias com STORAGE_DRIVER=supabase");
    return createClient(url, key, { auth: { persistSession: false } });
  })();

  async put(key: string, data: Buffer, contentType: string) {
    const bucket = this.client.storage.from(this.bucket);
    const { error } = await bucket.upload(key, data, { contentType, upsert: false, cacheControl: "31536000" });
    if (error) throw new Error(`Falha ao enviar imagem: ${error.message}`);
    return { url: bucket.getPublicUrl(key).data.publicUrl };
  }

  async delete(key: string) {
    await this.client.storage.from(this.bucket).remove([key]);
  }
}
