/** Pola ILIKE aman untuk filter .or() PostgREST (karakter khusus dibuang, nilai dikutip). */
export const ilikeValue = (s: string) => `"%${s.replace(/[%_,()"\\]/g, ' ').trim()}%"`;
