'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { Contact, ContactInput } from '@/lib/types';
import { useSession } from '@/components/SessionProvider';
import { ContactForm } from '@/components/ContactForm';

const SLOTS = [1, 2] as const;

type Editor =
  | { slot: number; mode: 'add' }
  | { slot: number; mode: 'edit'; contact: Contact }
  | null;

export function ContactsManager() {
  const router = useRouter();
  const { status } = useSession();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState('');
  const [formFields, setFormFields] = useState<Record<string, string>>({});
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const next = await api<Contact[]>('/api/contacts');
      setContacts(next);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace('/login');
        return;
      }
      setLoadError('We could not load your contacts. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login');
      return;
    }
    if (status === 'authenticated') {
      void load();
    }
    // load is stable enough for this screen; status gates the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function contactFor(slot: number) {
    return contacts.find((contact) => contact.slot === slot) ?? null;
  }

  function remember(saved: Contact, text: string) {
    setContacts((current) => [...current.filter((contact) => contact.id !== saved.id), saved].sort((a, b) => a.slot - b.slot));
    setEditor(null);
    setFormError('');
    setFormFields({});
    setConfirmRemove(null);
    setBanner({ tone: 'success', text });
  }

  async function save(slot: number, input: ContactInput, existing?: Contact) {
    setPending(true);
    setFormError('');
    setFormFields({});
    const duplicate = contacts.some(
      (contact) => contact.email.toLowerCase() === input.email.toLowerCase() && contact.id !== existing?.id,
    );
    if (duplicate) {
      setPending(false);
      setFormError('A contact with this email is already saved.');
      return;
    }

    try {
      const saved = existing
        ? await api<Contact>(`/api/contacts/${existing.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              fullName: input.fullName,
              email: input.email,
              phone: input.phone || null,
            }),
          })
        : await api<Contact>('/api/contacts', {
            method: 'POST',
            body: JSON.stringify({
              fullName: input.fullName,
              email: input.email,
              phone: input.phone || null,
              slot,
            }),
          });
      remember(saved, existing ? 'Contact updated.' : 'Contact saved.');
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        setFormFields(error.fields ?? {});
        if (error.status === 409 && /occupied/i.test(error.message)) {
          setBanner({ tone: 'error', text: error.message });
        }
      } else {
        setFormError('Unable to save the contact. Please try again.');
      }
    } finally {
      setPending(false);
    }
  }

  async function remove(contact: Contact) {
    setPending(true);
    setBanner(null);
    try {
      await api(`/api/contacts/${contact.id}`, { method: 'DELETE' });
      setContacts((current) => current.filter((item) => item.id !== contact.id));
      setConfirmRemove(null);
      setBanner({ tone: 'success', text: 'Contact removed.' });
    } catch (error) {
      setBanner({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Unable to remove the contact. Please try again.',
      });
    } finally {
      setPending(false);
    }
  }

  if (status !== 'authenticated' || loading) {
    return (
      <p className="text-base text-ink/70" data-testid="contacts-loading">
        {status === 'anonymous' ? 'Redirecting to sign in…' : 'Loading your contacts…'}
      </p>
    );
  }

  const bothOccupied = SLOTS.every((slot) => contactFor(slot));

  return (
    <div className="min-w-0">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-tide">Recipients</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">My Contacts</h1>
        <p className="mt-3 text-base leading-7 text-ink/75">Manage the people connected to your Digi Capsule.</p>
        <p className="mt-2 text-sm leading-6 text-ink/65">
          These two slots are for recipients who may receive your memories. Trusted contacts and verifiers are separate roles and are not managed here.
        </p>
      </div>

      {banner ? (
        <p
          className={`mt-6 rounded-2xl px-4 py-3 text-sm ${banner.tone === 'success' ? 'bg-moss/10 text-moss' : 'bg-clay/10 text-clay'}`}
          role="status"
          aria-live="polite"
          data-testid="banner"
        >
          {banner.text}
        </p>
      ) : null}

      {loadError ? (
        <div className="mt-6 rounded-2xl bg-clay/10 px-4 py-3 text-sm text-clay" role="alert">
          <p>{loadError}</p>
          <button type="button" className="mt-2 inline-flex min-h-11 items-center font-semibold underline" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : null}

      {contacts.length === 0 && !editor ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line bg-sand/60 px-4 py-4 text-sm leading-6 text-ink/75" data-testid="empty-state">
          No contacts yet. Add someone who should be connected to your Digi Capsule.
        </p>
      ) : null}

      {bothOccupied ? (
        <p className="mt-6 rounded-2xl bg-mist px-4 py-3 text-sm leading-6 text-ink" data-testid="slots-full-message">
          Both contact slots are occupied. Edit an existing contact to make changes. A third contact cannot be added.
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {SLOTS.map((slot) => {
          const contact = contactFor(slot);
          const editing = editor?.slot === slot;
          return (
            <article
              key={slot}
              className="min-w-0 rounded-3xl border border-line bg-card p-4 shadow-card sm:p-5"
              data-testid={`slot-${slot}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-serif text-2xl font-semibold">Contact {slot}</h2>
                  <p className="mt-1 text-sm font-semibold text-tide" data-testid={`slot-status-${slot}`}>
                    {contact ? 'Saved' : 'Empty'}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-mist px-3 py-1 text-xs font-semibold uppercase tracking-wide text-tide">
                  Recipient
                </span>
              </div>

              {contact && !editing ? (
                <div className="mt-4 min-w-0 space-y-1">
                  <p className="break-words text-lg font-semibold" data-testid={`contact-name-${slot}`}>
                    {contact.fullName}
                  </p>
                  <p className="break-all text-sm text-ink/80" data-testid={`contact-email-${slot}`}>
                    {contact.email}
                  </p>
                  {contact.phone ? (
                    <p className="break-all text-sm text-ink/80" data-testid={`contact-phone-${slot}`}>
                      {contact.phone}
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-2 pt-4 sm:flex-row">
                    <button
                      type="button"
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-tide px-4 text-base font-semibold text-white sm:w-auto"
                      data-testid={`edit-contact-${slot}`}
                      onClick={() => {
                        setEditor({ slot, mode: 'edit', contact });
                        setFormError('');
                        setFormFields({});
                        setConfirmRemove(null);
                        setBanner(null);
                      }}
                    >
                      Edit
                    </button>
                    {confirmRemove === slot ? (
                      <>
                        <button
                          type="button"
                          className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-clay px-4 text-base font-semibold text-white disabled:opacity-60 sm:w-auto"
                          data-testid={`confirm-remove-${slot}`}
                          disabled={pending}
                          onClick={() => void remove(contact)}
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-line px-4 text-base font-semibold sm:w-auto"
                          onClick={() => setConfirmRemove(null)}
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-line px-4 text-base font-semibold sm:w-auto"
                        data-testid={`remove-contact-${slot}`}
                        onClick={() => setConfirmRemove(slot)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ) : null}

              {!contact && !editing ? (
                <div className="mt-4">
                  <p className="text-sm leading-6 text-ink/70">This recipient slot is open.</p>
                  <button
                    type="button"
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-tide px-4 text-base font-semibold text-white sm:w-auto"
                    data-testid={`add-contact-${slot}`}
                    onClick={() => {
                      setEditor({ slot, mode: 'add' });
                      setFormError('');
                      setFormFields({});
                      setBanner(null);
                    }}
                  >
                    Add Contact
                  </button>
                </div>
              ) : null}

              {editing ? (
                <ContactForm
                  key={`${editor.mode}-${slot}-${contact?.updatedAt ?? 'new'}`}
                  initial={
                    editor.mode === 'edit'
                      ? { fullName: editor.contact.fullName, email: editor.contact.email, phone: editor.contact.phone ?? '' }
                      : { fullName: '', email: '', phone: '' }
                  }
                  submitLabel={editor.mode === 'edit' ? 'Save changes' : 'Save contact'}
                  pending={pending}
                  serverFields={formFields}
                  serverMessage={formError}
                  onCancel={() => {
                    setEditor(null);
                    setFormError('');
                    setFormFields({});
                  }}
                  onSubmit={(input) => void save(slot, input, editor.mode === 'edit' ? editor.contact : undefined)}
                />
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
