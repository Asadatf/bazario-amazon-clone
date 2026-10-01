'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { Alert, Card } from '@/components/ui/card';
import { Input, Label, Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { centsToDollarsInput, dollarsToCents, formatCents } from '@/lib/money';
import { useCategories } from '@/lib/queries';
import type { Product } from '@/lib/types';

interface FormState {
  title: string;
  description: string;
  price: string;
  stock: string;
  imageUrl: string;
  categoryId: string;
}

const EMPTY: FormState = { title: '', description: '', price: '', stock: '10', imageUrl: '', categoryId: '' };

function SellerCentral() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: categories } = useCategories();
  const products = useQuery({ queryKey: ['seller-products'], queryFn: () => api<Product[]>('/seller/products') });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['seller-products'] });
    void qc.invalidateQueries({ queryKey: ['products'] });
  };

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editingId ? api<Product>(`/products/${editingId}`, { method: 'PATCH', body }) : api<Product>('/products', { method: 'POST', body }),
    onSuccess: () => {
      setForm(EMPTY);
      setEditingId(null);
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api(`/products/${id}`, { method: 'DELETE' }), onSuccess: refresh });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const priceCents = dollarsToCents(form.price);
    if (!priceCents) return setFormError('Enter a price like 19.99');
    setFormError(null);
    save.mutate({
      title: form.title,
      description: form.description,
      priceCents,
      stock: Number(form.stock),
      imageUrl: form.imageUrl,
      categoryId: form.categoryId,
    });
  };

  const edit = (p: Product) => {
    setEditingId(p.id);
    setForm({
      title: p.title,
      description: p.description,
      price: centsToDollarsInput(p.priceCents),
      stock: String(p.stock),
      imageUrl: p.imageUrl,
      categoryId: p.categoryId,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: e.target.value });
  const error = formError ?? (save.error ? errorMessage(save.error) : remove.error ? errorMessage(remove.error) : null);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-5">
      <div>
        <h1 className="text-[28px]">Seller Central</h1>
        <p className="text-sm text-gray-600">
          {user?.role === 'ADMIN' ? 'Admin view: all products.' : `Managing products sold by ${user?.name}.`}
        </p>
      </div>

      <Card className="rounded-lg">
        <h2 className="mb-3 text-lg font-bold">{editingId ? 'Edit product' : 'Add a product'}</h2>
        {error && <div className="mb-3"><Alert>{error}</Alert></div>}
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><Label htmlFor="title">Title</Label><Input id="title" required maxLength={200} value={form.title} onChange={set('title')} /></div>
          <div className="md:col-span-2"><Label htmlFor="description">Description</Label><Textarea id="description" required rows={3} value={form.description} onChange={set('description')} /></div>
          <div><Label htmlFor="price">Price (USD)</Label><Input id="price" required inputMode="decimal" placeholder="19.99" value={form.price} onChange={set('price')} /></div>
          <div><Label htmlFor="stock">Stock</Label><Input id="stock" type="number" min={0} required value={form.stock} onChange={set('stock')} /></div>
          <div><Label htmlFor="imageUrl">Image URL (https)</Label><Input id="imageUrl" type="url" required value={form.imageUrl} onChange={set('imageUrl')} /></div>
          <div>
            <Label htmlFor="categoryId">Category</Label>
            <select id="categoryId" required value={form.categoryId} onChange={set('categoryId')} className="h-9 w-full rounded-md border border-[#888c8c] bg-white px-2 text-sm">
              <option value="">Choose…</option>
              {categories?.map((c) => (
                <optgroup key={c.id} label={c.name}>
                  {c.children.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex gap-2 md:col-span-2">
            <Button type="submit" disabled={save.isPending}>{editingId ? 'Save changes' : 'Add product'}</Button>
            {editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(EMPTY); }}>Cancel</Button>}
          </div>
        </form>
      </Card>

      <Card className="overflow-x-auto rounded-lg">
        <h2 className="mb-3 text-lg font-bold">Your inventory ({products.data?.length ?? 0})</h2>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-gray-600 uppercase">
            <tr><th className="py-2">Product</th><th>Price</th><th>Stock</th><th className="text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y">
            {products.data?.map((p) => (
              <tr key={p.id}>
                <td className="flex items-center gap-3 py-2"><img src={p.imageUrl} alt="" className="h-10 w-10 object-contain" /> <span className="line-clamp-1">{p.title}</span></td>
                <td>{formatCents(p.priceCents)}</td>
                <td className={p.stock === 0 ? 'text-deal' : ''}>{p.stock}</td>
                <td className="space-x-2 text-right whitespace-nowrap">
                  <Button size="sm" variant="outline" onClick={() => edit(p)}>Edit</Button>
                  <Button size="sm" variant="danger" disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete "${p.title}"?`)) remove.mutate(p.id); }}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default function SellerPage() {
  return <RequireAuth roles={['SELLER']}><SellerCentral /></RequireAuth>;
}
