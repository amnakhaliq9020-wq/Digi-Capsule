'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/components/SessionProvider';

const links = [
  { href: '/', label: 'Home', id: 'home' },
  { href: '/capsules', label: 'Capsules', id: 'capsules' },
  { href: '/contacts', label: 'People', id: 'contacts' },
  { href: '/activity', label: 'Activity', id: 'activity' },
  { href: '/settings', label: 'Settings', id: 'settings' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { status, user, clear } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' });
    clear();
    setOpen(false);
    router.push('/');
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-card/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2 text-ink">
          <CapsuleMark className="h-8 w-8 shrink-0" />
          <span className="truncate font-serif text-lg font-semibold tracking-tight">Digi Capsule</span>
        </Link>

        <nav className="hidden items-center gap-4 lg:flex" data-testid="nav-desktop" aria-label="Primary">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`whitespace-nowrap text-sm font-semibold ${pathname === link.href ? 'text-tide' : 'text-ink/80 hover:text-ink'}`}
              data-testid={`nav-desktop-${link.id}`}
            >
              {link.label}
            </Link>
          ))}
          {status === 'authenticated' && user ? (
            <>
              <Link href="/settings" className="max-w-[8rem] truncate text-sm font-semibold text-ink" data-testid="account-profile" title={user.email}>
                {user.name}
              </Link>
              <button type="button" className="min-h-11 whitespace-nowrap rounded-full px-3 text-sm font-semibold text-tide" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="inline-flex min-h-11 items-center rounded-full bg-tide px-4 text-sm font-semibold text-white">
              Sign in
            </Link>
          )}
        </nav>

        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-line bg-paper text-sm font-semibold lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          data-testid="nav-toggle"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>

      {open ? (
        <nav id="mobile-nav" className="border-t border-line bg-card lg:hidden" data-testid="nav-mobile" aria-label="Mobile">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-3">
            {status === 'authenticated' && user ? (
              <p className="break-all text-sm text-ink/70" data-testid="account-email-mobile">
                {user.name} · {user.email}
              </p>
            ) : null}
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex min-h-11 items-center rounded-xl px-3 text-base font-semibold hover:bg-mist"
                data-testid={`nav-link-${link.id}`}
              >
                {link.label}
              </Link>
            ))}
            {status === 'authenticated' ? (
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-xl px-3 text-left text-base font-semibold text-tide hover:bg-mist"
                onClick={signOut}
              >
                Sign out
              </button>
            ) : (
              <Link href="/login" className="inline-flex min-h-11 items-center rounded-xl bg-tide px-3 text-base font-semibold text-white">
                Sign in
              </Link>
            )}
          </div>
        </nav>
      ) : null}
    </header>
  );
}

export function CapsuleMark({ className, label }: { className?: string; label?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" role={label ? 'img' : 'presentation'} aria-label={label} aria-hidden={label ? undefined : true}>
      <rect width="64" height="64" rx="18" fill="#1f5c57" />
      <path d="M18 34c0-8 6-14 14-14s14 6 14 14-6 14-14 14-14-6-14-14Z" fill="#f4f0e8" />
      <path d="M26 34h12M32 28v12" stroke="#1f5c57" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
