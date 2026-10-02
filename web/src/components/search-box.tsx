'use client';

import { Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, KeyboardEvent, useEffect, useId, useState } from 'react';
import { formatCents } from '@/lib/money';
import { useCategories, useSuggestions } from '@/lib/queries';
import { useDebounced } from '@/lib/use-debounced';
import { cn } from '@/lib/utils';

/** Bolds the part of a title that matches what was typed (case-insensitive substring). */
function Highlight({ text, query }: { text: string; query: string }) {
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (!query || i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <b>{text.slice(i, i + query.length)}</b>
      {text.slice(i + query.length)}
    </>
  );
}

/**
 * Header search with typo-tolerant product suggestions. A WAI-ARIA combobox: arrow keys move through
 * suggestions, Enter opens the highlighted product (or searches the typed text), Escape closes.
 */
export function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: categories } = useCategories();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();

  const debounced = useDebounced(q.trim(), 150);
  const { data: suggestions = [] } = useSuggestions(debounced);
  const showList = open && q.trim().length >= 2 && suggestions.length > 0;

  useEffect(() => {
    setQ(params.get('q') ?? '');
    setCategory(params.get('category') ?? '');
  }, [params]);

  useEffect(() => setActive(-1), [debounced]);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (active >= 0 && suggestions[active]) {
      router.push(`/p/${suggestions[active].id}`);
    } else {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('q', q.trim());
      if (category) qs.set('category', category);
      router.push(`/s?${qs.toString()}`);
    }
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      close();
    }
  };

  return (
    <form onSubmit={submit} className="relative flex h-10 flex-1 rounded-md focus-within:ring-3 focus-within:ring-brand" role="search">
      <select
        aria-label="Search in category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="hidden max-w-40 cursor-pointer rounded-l-md border-r border-gray-300 bg-[#e6e6e6] px-2 text-xs text-gray-700 hover:bg-[#d4d4d4] sm:block"
      >
        <option value="">All</option>
        {categories?.map((c) => (
          <option key={c.slug} value={c.slug}>{c.name}</option>
        ))}
      </select>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onKeyDown={onKeyDown}
        placeholder="Search Bazario"
        aria-label="Search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className="min-w-0 flex-1 bg-white px-3 text-[15px] text-black outline-none max-sm:rounded-l-md"
      />
      <button type="submit" aria-label="Go" className="flex w-12 items-center justify-center rounded-r-md bg-brand text-nav hover:bg-brand-dark">
        <Search className="h-5 w-5" />
      </button>

      {showList && (
        <ul id={listId} role="listbox" className="absolute top-full right-12 left-0 z-50 mt-0.5 overflow-hidden rounded-b-md bg-white text-black shadow-xl sm:left-[0px]">
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: fires before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                router.push(`/p/${s.id}`);
                close();
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm', i === active && 'bg-[#f0f2f2]')}
            >
              <img src={s.imageUrl} alt="" className="h-9 w-9 shrink-0 object-contain" />
              <span className="flex-1 truncate"><Highlight text={s.title} query={q.trim()} /></span>
              <span className="text-xs text-gray-600">{formatCents(s.priceCents)}</span>
            </li>
          ))}
          <li
            role="option"
            aria-selected={false}
            onMouseDown={(e) => {
              e.preventDefault();
              setActive(-1);
              submit();
            }}
            className="cursor-pointer border-t px-3 py-2 text-sm link"
          >
            See all results for &quot;{q.trim()}&quot;
          </li>
        </ul>
      )}
    </form>
  );
}
