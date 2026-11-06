'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/components/SessionProvider';

type Mode = 'login' | 'register';

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { refresh } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextFields: Record<string, string> = {};
    if (mode === 'register' && name.trim().length < 2) nextFields.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextFields.email = 'Enter a valid email address.';
    if (password.length < 8) nextFields.password = 'Password must be at least 8 characters.';
    if (mode === 'register' && password !== confirm) nextFields.confirm = 'Passwords do not match.';
    setFields(nextFields);
    setMessage('');
    if (Object.keys(nextFields).length) return;

    setPending(true);
    try {
      if (mode === 'register') {
        await api('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
        });
      } else {
        await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), password }),
        });
      }
      await refresh();
      router.push('/contacts');
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(error.message);
        setFields(error.fields ?? {});
      } else {
        setMessage('Something went wrong. Please try again.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-md space-y-4 rounded-3xl border border-line bg-card p-5 shadow-card sm:p-8" noValidate>
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          {mode === 'login' ? 'Sign in' : 'Create your account'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink/70">
          {mode === 'login'
            ? 'Sign in to manage the recipients connected to your Digi Capsule.'
            : 'Your account keeps your recipient contacts private to you.'}
        </p>
      </div>

      {message ? (
        <p className="rounded-2xl bg-clay/10 px-3 py-3 text-sm text-clay" role="alert" data-testid="auth-error">
          {message}
        </p>
      ) : null}

      {mode === 'register' ? (
        <Field label="Full name" id="account-name" error={fields.name}>
          <input id="account-name" data-testid="field-name" className={inputClass} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
        </Field>
      ) : null}

      <Field label="Email" id="account-email" error={fields.email}>
        <input id="account-email" data-testid="field-email" className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" />
      </Field>

      <Field label="Password" id="account-password" error={fields.password}>
        <input id="account-password" data-testid="field-password" className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
      </Field>

      {mode === 'register' ? (
        <Field label="Confirm password" id="account-confirm" error={fields.confirm}>
          <input id="account-confirm" data-testid="field-confirm" className={inputClass} type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" />
        </Field>
      ) : null}

      <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-tide px-4 text-base font-semibold text-white hover:bg-tideDark disabled:opacity-60" disabled={pending} data-testid="submit-auth">
        {pending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
      </button>

      <p className="text-sm text-ink/70">
        {mode === 'login' ? (
          <>
            New to Digi Capsule?{' '}
            <Link href="/register" className="font-semibold text-tide">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-tide">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-clay" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputClass =
  'min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base text-ink outline-none ring-tide focus:ring-2';
