import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { formatRupiah } from '@/lib/format';
import { formatQty } from '@/lib/production';
import { Badge, Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

type Row = {
  id: string;
  nama: string;
  satuan: string;
  recipe: { id: string; yield_per_batch: number; catatan: string | null; items: { ingredient_id: string; qty_per_batch: number }[] } | null;
};

export function Recipes() {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';
  const [editing, setEditing] = useState<Row | null>(null);

  const q = useQuery({
    queryKey: ['recipes', isOwner],
    queryFn: async () => {
      const [products, recipes, items, ingredients, costs] = await Promise.all([
        supabase.from('products').select('id, nama, satuan').order('urutan').order('nama'),
        supabase.from('recipes').select('*'),
        supabase.from('recipe_items').select('*'),
        supabase.from('ingredients').select('id, nama, satuan').order('nama'),
        isOwner ? supabase.from('biaya_bahan').select('id, cost_per_unit') : Promise.resolve({ data: [] as { id: string; cost_per_unit: number }[], error: null }),
      ]);
      const err = products.error ?? recipes.error ?? items.error ?? ingredients.error;
      if (err) throw err;
      const recipeRows = recipes.data ?? [];
      const itemRows = items.data ?? [];
      const rows: Row[] = (products.data ?? []).map((p) => {
        const r = recipeRows.find((x) => x.product_id === p.id);
        return { ...p, recipe: r ? { ...r, items: itemRows.filter((i) => i.recipe_id === r.id) } : null };
      });
      return { rows, ingredients: ingredients.data ?? [], costs: new Map((costs.data ?? []).map((c) => [c.id, Number(c.cost_per_unit)])) };
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const ingName = new Map(q.data!.ingredients.map((i) => [i.id, i]));

  return (
    <>
      <PageHeader title="Resep" description={isOwner ? 'Bahan, takaran per batch, dan hasil per batch. Dipakai otomatis saat input produksi.' : 'Resep produk (hanya bisa dilihat).'} />
      {q.data!.rows.length === 0 ? (
        <EmptyState icon={<BookOpen className="size-8" />} title="Belum ada produk" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {q.data!.rows.map((p) => {
            const hpp = p.recipe && isOwner ? p.recipe.items.reduce((s, i) => s + i.qty_per_batch * (q.data!.costs.get(i.ingredient_id) ?? 0), 0) : null;
            return (
              <Card key={p.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-sans text-lg font-bold">{p.nama}</h2>
                    {p.recipe ? (
                      <p className="text-sm text-cocoa-600">
                        1 batch = <strong>{formatQty(p.recipe.yield_per_batch)} {p.satuan}</strong>
                        {hpp !== null && (
                          <>
                            {' '}· estimasi HPP {formatRupiah(hpp / p.recipe.yield_per_batch)}/{p.satuan}
                          </>
                        )}
                      </p>
                    ) : (
                      <Badge tone="amber">Belum ada resep</Badge>
                    )}
                  </div>
                  {isOwner && (
                    <Button size="sm" variant="secondary" icon={p.recipe ? <Pencil className="size-4" /> : <Plus className="size-4" />} onClick={() => setEditing(p)}>
                      {p.recipe ? 'Ubah' : 'Buat resep'}
                    </Button>
                  )}
                </div>
                {p.recipe && (
                  <ul className="mt-3 divide-y divide-cream-200 text-sm">
                    {p.recipe.items.map((i) => (
                      <li key={i.ingredient_id} className="flex justify-between py-1.5">
                        <span>{ingName.get(i.ingredient_id)?.nama}</span>
                        <span className="tabular-nums">
                          {formatQty(i.qty_per_batch)} {ingName.get(i.ingredient_id)?.satuan}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {p.recipe?.catatan && <p className="mt-2 text-xs whitespace-pre-line text-cocoa-500">{p.recipe.catatan}</p>}
              </Card>
            );
          })}
        </div>
      )}
      {editing && <RecipeModal row={editing} ingredients={q.data!.ingredients} onClose={() => setEditing(null)} />}
    </>
  );
}

function RecipeModal({ row, ingredients, onClose }: { row: Row; ingredients: { id: string; nama: string; satuan: string }[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [yieldPerBatch, setYield] = useState(String(row.recipe?.yield_per_batch ?? ''));
  const [catatan, setCatatan] = useState(row.recipe?.catatan ?? '');
  const [items, setItems] = useState<{ ingredient_id: string; qty: string }[]>(
    row.recipe?.items.map((i) => ({ ingredient_id: i.ingredient_id, qty: String(i.qty_per_batch) })) ?? [{ ingredient_id: '', qty: '' }],
  );
  const valid =
    Number(yieldPerBatch) > 0 &&
    items.length > 0 &&
    items.every((i) => i.ingredient_id && Number(i.qty) > 0) &&
    new Set(items.map((i) => i.ingredient_id)).size === items.length;

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('save_recipe', {
        p_product_id: row.id,
        p_yield: Number(yieldPerBatch),
        p_items: items.map((i) => ({ ingredient_id: i.ingredient_id, qty: Number(i.qty) })),
        p_catatan: catatan || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', `Resep ${row.nama} tersimpan.`);
      void qc.invalidateQueries({ queryKey: ['recipes'] });
      void qc.invalidateQueries({ queryKey: ['production_products'] });
      onClose();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Resep ${row.nama}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button loading={m.isPending} disabled={!valid} onClick={() => m.mutate()}>
            Simpan resep
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label={`Hasil per batch (${row.satuan})`} type="number" inputMode="decimal" min={0} value={yieldPerBatch} onChange={(e) => setYield(e.target.value)} hint="Contoh: 1 batch Soes = 70 pcs" />
        <div>
          <p className="mb-2 text-sm font-semibold">Bahan per batch</p>
          <div className="space-y-2">
            {items.map((it, idx) => {
              const ing = ingredients.find((x) => x.id === it.ingredient_id);
              const dup = it.ingredient_id && items.filter((x) => x.ingredient_id === it.ingredient_id).length > 1;
              return (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    className={`h-11 min-w-0 flex-1 rounded-xl border bg-white px-2 text-sm ${dup ? 'border-red-400' : 'border-cream-300'}`}
                    value={it.ingredient_id}
                    onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, ingredient_id: e.target.value } : x)))}
                    aria-label="Bahan"
                  >
                    <option value="">Pilih bahan…</option>
                    {ingredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.nama}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    className="h-11 w-24 rounded-xl border border-cream-300 bg-white px-2 text-right text-sm"
                    value={it.qty}
                    onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))}
                    aria-label="Takaran"
                  />
                  <span className="w-12 text-xs text-cocoa-500">{ing?.satuan}</span>
                  <button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => setItems(items.filter((_, i) => i !== idx))} aria-label="Hapus bahan" disabled={items.length === 1}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <Button size="sm" variant="ghost" className="mt-2" icon={<Plus className="size-4" />} onClick={() => setItems([...items, { ingredient_id: '', qty: '' }])}>
            Tambah bahan
          </Button>
        </div>
        <Textarea label="Catatan (opsional)" value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={1000} />
      </div>
    </Modal>
  );
}
