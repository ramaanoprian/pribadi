import { useContent } from '@/hooks/usePublic';
import { LoadingState } from '@/components/ui/States';

export function Story() {
  const { c, isLoading } = useContent();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <img src="/brand/symbol.png" alt="" className="size-14" />
      <h1 className="mt-4 text-4xl font-bold">{c('cerita.judul', 'Cerita Kami')}</h1>
      {isLoading ? (
        <div className="mt-6">
          <LoadingState />
        </div>
      ) : (
        <div className="mt-6 space-y-4 text-lg leading-relaxed whitespace-pre-line text-cocoa-700">{c('cerita.isi')}</div>
      )}
    </div>
  );
}
