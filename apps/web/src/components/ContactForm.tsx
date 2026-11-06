'use client';

import { FormEvent, useState } from 'react';
import { ContactInput } from '@/lib/types';

const NAME_PATTERN = /^[\p{L}][\p{L}\p{M}\s.'-]{1,119}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;

export function normalizePhone(value: string) {
  return value.trim().replace(/[\s()-]/g, '');
}

export function validateContact(input: ContactInput) {
  const fields: Record<string, string> = {};
  const fullName = input.fullName.trim();
  const email = input.email.trim();
  const phone = normalizePhone(input.phone);

  if (!NAME_PATTERN.test(fullName)) {
    fields.fullName = 'Enter the contact’s full name.';
  }
  if (!EMAIL_PATTERN.test(email)) {
    fields.email = 'Enter a valid email address.';
  }
  if (phone && !PHONE_PATTERN.test(phone)) {
    fields.phone = 'Use a country code, for example +923001234567.';
  }

  return { fields, fullName, email, phone };
}

export function ContactForm({
  initial,
  submitLabel,
  pending,
  serverFields,
  serverMessage,
  onSubmit,
  onCancel,
}: {
  initial: ContactInput;
  submitLabel: string;
  pending: boolean;
  serverFields?: Record<string, string>;
  serverMessage?: string;
  onSubmit: (input: ContactInput) => void;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = useState(initial.fullName);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [fields, setFields] = useState<Record<string, string>>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateContact({ fullName, email, phone });
    setFields(result.fields);
    if (Object.keys(result.fields).length) return;
    onSubmit({ fullName: result.fullName, email: result.email, phone: result.phone });
  }

  const shown = { ...serverFields, ...fields };

  return (
    <form onSubmit={handleSubmit} className="mt-4 min-w-0 space-y-3" data-testid="contact-form" noValidate>
      {serverMessage ? (
        <p className="rounded-2xl bg-clay/10 px-3 py-3 text-sm text-clay" role="alert" data-testid="form-error">
          {serverMessage}
        </p>
      ) : null}

      <FormField id="contact-name" label="Full name" error={shown.fullName}>
        <input
          id="contact-name"
          data-testid="field-fullName"
          className={inputClass}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          autoComplete="name"
          aria-invalid={Boolean(shown.fullName)}
          aria-describedby={shown.fullName ? 'contact-name-error' : undefined}
        />
      </FormField>

      <FormField id="contact-email" label="Email" error={shown.email}>
        <input
          id="contact-email"
          data-testid="field-email"
          className={inputClass}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          inputMode="email"
          aria-invalid={Boolean(shown.email)}
          aria-describedby={shown.email ? 'contact-email-error' : undefined}
        />
      </FormField>

      <FormField id="contact-phone" label="Phone (optional)" error={shown.phone}>
        <input
          id="contact-phone"
          data-testid="field-phone"
          className={inputClass}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          autoComplete="tel"
          inputMode="tel"
          placeholder="+923001234567"
          aria-invalid={Boolean(shown.phone)}
          aria-describedby={shown.phone ? 'contact-phone-error' : undefined}
        />
      </FormField>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-tide px-4 text-base font-semibold text-white hover:bg-tideDark disabled:opacity-60 sm:w-auto"
          disabled={pending}
          data-testid="save-contact"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-line bg-white px-4 text-base font-semibold text-ink sm:w-auto"
          onClick={onCancel}
          disabled={pending}
          data-testid="cancel-contact"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function FormField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
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
