'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/components/SessionProvider';
import { Capsule, MemoryType } from '@/lib/types';

const memoryChoices: { type: MemoryType; label: string }[] = [
  { type: 'PHOTO', label: 'Add photos' },
  { type: 'VIDEO', label: 'Add a video' },
  { type: 'AUDIO', label: 'Add audio' },
  { type: 'DOCUMENT', label: 'Add a document' },
  { type: 'LETTER', label: 'Write a letter' },
];

export function CapsuleManager() {
  const router = useRouter();
  const { status } = useSession();
  const [capsules, setCapsules] = useState<Capsule[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login');
      return;
    }
    if (status !== 'authenticated') return;
    api<Capsule[]>('/api/capsules')
      .then(setCapsules)
      .catch(() => setError('We could not load your capsules.'))
      .finally(() => setLoading(false));
  }, [router, status]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const created = await api<Capsule>('/api/capsules', {
        method: 'POST',
        body: JSON.stringify({ title, description: description || null }),
      });
      setCapsules((current) => [{ ...created, _count: { memories: 0 } }, ...current]);
      setTitle('');
      setDescription('');
      setMessage('Capsule created. Add photos, a video, audio, a document, or a letter to it below.');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'The capsule could not be created.');
    } finally {
      setPending(false);
    }
  }

  if (loading) return <p>Loading your capsules…</p>;

  return (
    <section className="min-w-0">
      <h1 className="font-serif text-4xl font-semibold">Capsules</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-ink/70">
        A capsule is a private collection. After you create one, add pictures, a video, audio, a document, or a letter inside it.
      </p>
      {message ? <p className="mt-4 rounded-2xl bg-moss/10 px-4 py-3 text-sm text-moss" role="status">{message}</p> : null}
      {error ? <p className="mt-4 rounded-2xl bg-clay/10 px-4 py-3 text-sm text-clay" role="alert">{error}</p> : null}
      <form className="mt-6 max-w-xl space-y-3 rounded-3xl border border-line bg-card p-5 shadow-card" onSubmit={onSubmit}>
        <label className="block text-sm font-semibold" htmlFor="new-capsule-title">
          Title
          <input id="new-capsule-title" className="mt-1.5 min-h-11 w-full rounded-xl border border-line px-3" value={title} data-testid="new-capsule-title" onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="block text-sm font-semibold" htmlFor="new-capsule-description">
          Description
          <textarea id="new-capsule-description" className="mt-1.5 min-h-24 w-full rounded-xl border border-line px-3 py-2" value={description} data-testid="new-capsule-description" onChange={(event) => setDescription(event.target.value)} />
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-full bg-tide px-5 font-semibold text-white disabled:opacity-60" disabled={pending} data-testid="create-capsule">
          {pending ? 'Saving…' : 'Create capsule'}
        </button>
      </form>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {capsules.map((capsule) => (
          <article key={capsule.id} className="min-w-0 rounded-3xl border border-line bg-card p-5" data-testid="capsule-card">
            <h2 className="break-words font-serif text-2xl font-semibold">{capsule.title}</h2>
            {capsule.description ? <p className="mt-2 break-words text-sm leading-6 text-ink/75">{capsule.description}</p> : null}
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink/50">{capsule._count?.memories ?? 0} memories</p>
            <div className="mt-4 flex flex-col gap-2">
              {memoryChoices.map((choice) => (
                <Link
                  key={choice.type}
                  href={`/memories/new?capsule=${capsule.id}&type=${choice.type}`}
                  className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold ${choice.type === 'PHOTO' ? 'bg-tide text-white' : 'border border-line bg-white'}`}
                  data-testid={`add-${choice.type.toLowerCase()}-${capsule.id}`}
                >
                  {choice.label}
                </Link>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
