'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/components/SessionProvider';

export function SettingsPanel() {
  const router = useRouter();
  const { status, user } = useSession();

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [router, status]);

  if (status !== 'authenticated' || !user) return <p>Loading your settings…</p>;

  return (
    <section className="max-w-2xl">
      <h1 className="font-serif text-4xl font-semibold">Settings</h1>
      <div className="mt-6 rounded-3xl border border-line bg-card p-5 shadow-card">
        <h2 className="font-serif text-2xl font-semibold">Profile</h2>
        <p className="mt-2 text-sm">{user.name}</p>
        <p className="break-all text-sm text-ink/70">{user.email}</p>
      </div>
      <div className="mt-4 rounded-3xl border border-line bg-card p-5 shadow-card" data-testid="release-settings">
        <h2 className="font-serif text-2xl font-semibold">Release</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-ink/75">
          <li>Saving a memory does not send it to anyone.</li>
          <li>Creating a memory does not schedule a release.</li>
          <li>A missed monthly check-in does not release memories.</li>
          <li>Release if someone is gone: switched off.</li>
          <li>Recipients and trusted contacts cannot open your private memories.</li>
        </ul>
      </div>
    </section>
  );
}
