'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useSession } from '@/components/SessionProvider';
import { MemorySummary, TYPE_LABEL } from '@/lib/types';

export function ActivityList() {
  const router = useRouter();
  const { status } = useSession();
  const [items, setItems] = useState<MemorySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login');
      return;
    }
    if (status !== 'authenticated') return;
    api<MemorySummary[]>('/api/memories')
      .then((memories) => setItems([...memories].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))))
      .finally(() => setLoading(false));
  }, [router, status]);

  if (loading) return <p>Loading activity…</p>;

  return (
    <section>
      <h1 className="font-serif text-4xl font-semibold">Activity</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/70">Recent changes to your private drafts. Nothing here is sent to contacts.</p>
      {items.length === 0 ? (
        <p className="mt-6 text-sm text-ink/70">No memory activity yet.</p>
      ) : (
        <ol className="mt-6 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl border border-line bg-card px-4 py-3 text-sm">
              Saved {TYPE_LABEL[item.type].toLowerCase()} draft “{item.title}” · {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.updatedAt))}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
