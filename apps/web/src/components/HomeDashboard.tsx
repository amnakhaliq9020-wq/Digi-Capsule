'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/components/SessionProvider';
import { MemoryStatus, MemorySummary, MemoryType, STATUS_LABEL, TYPE_LABEL } from '@/lib/types';

const notices: Record<string, string> = {
  saved: 'Memory saved as a draft. It has not been sent to anyone.',
  updated: 'Memory updated.',
  deleted: 'Memory deleted.',
};

export function HomeDashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, user } = useSession();
  const [memories, setMemories] = useState<MemorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    const notice = params.get('notice');
    if (notice && notices[notice]) setBanner(notices[notice]);
  }, [params]);

  useEffect(() => {
    if (status === 'anonymous') {
      setLoading(false);
      return;
    }
    if (status !== 'authenticated') return;
    let cancelled = false;
    api<MemorySummary[]>('/api/memories')
      .then((items) => {
        if (!cancelled) setMemories(items);
      })
      .catch((reason: unknown) => {
        if (reason instanceof ApiError && reason.status === 401) {
          router.replace('/login');
          return;
        }
        if (!cancelled) setError('We could not load your memories. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, router]);

  async function remove(id: string) {
    setError('');
    try {
      await api(`/api/memories/${id}`, { method: 'DELETE' });
      setMemories((current) => current.filter((memory) => memory.id !== id));
      setPendingDelete(null);
      setBanner('Memory deleted.');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'The memory could not be deleted.');
    }
  }

  if (status === 'loading' || (status === 'authenticated' && loading)) {
    return <p data-testid="dashboard-loading">Loading your memories…</p>;
  }

  if (status !== 'authenticated' || !user) {
    return (
      <section className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-tide">Digi Capsule</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          Your memories, safely kept for the moments that matter.
        </h1>
        <p className="mt-4 text-base leading-7 text-ink/75">
          Sign in to preserve letters, photos, videos, audio, and documents for yourself and the people you love.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/memories/new" className="inline-flex min-h-11 items-center justify-center rounded-full bg-tide px-5 font-semibold text-white" data-testid="create-memory">
            + Create Memory
          </Link>
          <Link href="/login" className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-card px-5 font-semibold">
            Sign in
          </Link>
          <Link href="/register" className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-card px-5 font-semibold">
            Create an account
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="min-w-0">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-tide">Welcome, {user.name}</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight sm:text-5xl" data-testid="welcome-message">
            Your memories, safely kept for the moments that matter.
          </h1>
          <p className="mt-3 text-base leading-7 text-ink/75">
            Preserve personal memories for yourself and your loved ones. Saving a memory keeps it private. It is not sent or scheduled.
          </p>
        </div>
        <Link
          href="/memories/new"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-tide px-5 text-base font-semibold text-white hover:bg-tideDark"
          data-testid="create-memory"
        >
          + Create Memory
        </Link>
      </div>

      {banner ? (
        <p className="mt-6 rounded-2xl bg-moss/10 px-4 py-3 text-sm text-moss" role="status" data-testid="banner">
          {banner}
        </p>
      ) : null}
      {error ? (
        <p className="mt-6 rounded-2xl bg-clay/10 px-4 py-3 text-sm text-clay" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-10">
        <h2 className="font-serif text-3xl font-semibold">My Memories</h2>
        {memories.length === 0 ? (
          <div className="mt-4 rounded-3xl border border-dashed border-line bg-sand/70 px-5 py-8" data-testid="empty-memories">
            <p className="font-serif text-2xl font-semibold">Your memory collection is waiting to begin.</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-ink/75">
              Create a private letter, photo, video, audio recording, or document. It stays in your capsule until you choose what happens next.
            </p>
            <Link
              href="/memories/new"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-tide px-5 font-semibold text-white"
              data-testid="create-first-memory"
            >
              Create Your First Memory
            </Link>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {memories.map((memory) => (
              <article key={memory.id} className="flex min-w-0 flex-col rounded-3xl border border-line bg-card p-5 shadow-card" data-testid="memory-card">
                <div className="flex items-start justify-between gap-3">
                  <TypeBadge type={memory.type} />
                  <StatusBadge status={memory.status} />
                </div>
                <h3 className="mt-4 break-words font-serif text-2xl font-semibold" data-testid="memory-title">
                  {memory.title}
                </h3>
                <p className="mt-2 min-h-12 break-words text-sm leading-6 text-ink/75">{memory.preview || 'No description yet.'}</p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink/50">
                  {memory.capsuleTitle} · {formatDate(memory.createdAt)}
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Link href={`/memories/${memory.id}`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-tide px-4 font-semibold text-white" data-testid={`edit-memory-${memory.id}`}>
                    Edit
                  </Link>
                  {pendingDelete === memory.id ? (
                    <>
                      <button type="button" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-clay px-4 font-semibold text-white" data-testid={`confirm-delete-${memory.id}`} onClick={() => void remove(memory.id)}>
                        Delete
                      </button>
                      <button type="button" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-line px-4 font-semibold" onClick={() => setPendingDelete(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button type="button" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-line px-4 font-semibold" data-testid={`delete-memory-${memory.id}`} onClick={() => setPendingDelete(memory.id)}>
                      Delete
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TypeBadge({ type }: { type: MemoryType }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold text-tide">
      <TypeIcon type={type} />
      {TYPE_LABEL[type]}
    </span>
  );
}

function StatusBadge({ status }: { status: MemoryStatus }) {
  return <span className="rounded-full bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-wide text-tide">{STATUS_LABEL[status]}</span>;
}

export function TypeIcon({ type }: { type: MemoryType }) {
  const common = 'h-5 w-5 shrink-0';
  if (type === 'PHOTO') {
    return (
      <svg className={common} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="9" cy="10" r="1.5" fill="currentColor" />
        <path d="M7 16l3.5-3.5L14 16l2-2 2 2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (type === 'VIDEO') {
    return (
      <svg className={common} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="6" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M15 10l6-3v10l-6-3z" fill="currentColor" />
      </svg>
    );
  }
  if (type === 'AUDIO') {
    return (
      <svg className={common} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 9v6M12 7v10M15 10v4M18 8v8M6 11v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === 'DOCUMENT') {
    return (
      <svg className={common} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3h7l5 5v13H7z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M14 3v5h5M9 13h6M9 17h6" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg className={common} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 4h12v16H6z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}
