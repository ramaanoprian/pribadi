// Pemanggil RPC PostgREST tanpa dependensi eksternal.
export class RpcError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

export function env(key: string): string {
  const v = Deno.env.get(key);
  if (!v) throw new Error(`Env ${key} belum diatur`);
  return v;
}

/** Panggil RPC. Tanpa `authHeader` = sebagai service_role (khusus server). */
export async function rpc<T = unknown>(name: string, args: Record<string, unknown> = {}, authHeader?: string): Promise<T> {
  const url = env('SUPABASE_URL');
  const key = authHeader ? env('SUPABASE_ANON_KEY') : env('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: authHeader ?? `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new RpcError(data?.message ?? `RPC ${name} gagal (${res.status})`, res.status, data?.code);
  }
  return data as T;
}
