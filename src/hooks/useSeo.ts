import { useEffect } from 'react';

const SITE = 'GutVibes Bakehouse';
const DEFAULT_DESC = 'GutVibes — kue & roti rumahan dipanggang segar setiap hari. Pesan online, ambil di toko atau diantar, kumpulkan stamp member.';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

/** Judul halaman, deskripsi, Open Graph, dan robots per rute. */
export function useSeo({ title, description, noindex }: { title?: string; description?: string; noindex?: boolean }) {
  useEffect(() => {
    const full = title ? `${title} · ${SITE}` : `${SITE} — Kue & roti rumahan`;
    document.title = full;
    const desc = description?.slice(0, 160) || DEFAULT_DESC;
    setMeta('name', 'description', desc);
    setMeta('property', 'og:title', full);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:url', window.location.href);
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = window.location.origin + window.location.pathname;
  }, [title, description, noindex]);
}
