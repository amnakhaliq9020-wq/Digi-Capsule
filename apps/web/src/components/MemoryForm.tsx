'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/components/SessionProvider';
import { ACCEPT, fileError, uploadFile } from '@/lib/upload';
import { Capsule, MediaAsset, MemoryDetail, MemoryType, TYPE_LABEL, UploadKind } from '@/lib/types';

const types: MemoryType[] = ['LETTER', 'PHOTO', 'VIDEO', 'AUDIO', 'DOCUMENT'];

type LocalAsset = MediaAsset & { progress?: number };

export function MemoryForm({ memoryId }: { memoryId?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const requestedCapsule = params.get('capsule');
  const requestedType = params.get('type');
  const { status } = useSession();
  const [capsules, setCapsules] = useState<Capsule[]>([]);
  const [capsuleId, setCapsuleId] = useState('');
  const [newCapsule, setNewCapsule] = useState(false);
  const [capsuleTitle, setCapsuleTitle] = useState('');
  const [capsuleDescription, setCapsuleDescription] = useState('');
  const [type, setType] = useState<MemoryType>('LETTER');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [assets, setAssets] = useState<LocalAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [baseline, setBaseline] = useState('');
  const [originalAssetIds, setOriginalAssetIds] = useState<string[]>([]);

  const snapshot = useMemo(
    () => JSON.stringify({ capsuleId, type, title, description, body, tags, assets: assets.map((asset) => asset.id) }),
    [assets, body, capsuleId, description, tags, title, type],
  );
  const dirty = baseline !== '' && snapshot !== baseline;

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login');
      return;
    }
    if (status !== 'authenticated') return;
    let cancelled = false;

    async function load() {
      try {
        const [capsuleList, memory] = await Promise.all([
          api<Capsule[]>('/api/capsules'),
          memoryId ? api<MemoryDetail>(`/api/memories/${memoryId}`) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setCapsules(capsuleList);
        if (memory) {
          setCapsuleId(memory.capsuleId);
          setType(memory.type);
          setTitle(memory.title);
          setDescription(memory.description ?? '');
          setBody(memory.body ?? '');
          setTags(memory.tags.join(', '));
          setAssets(memory.assets);
          setOriginalAssetIds(memory.assets.map((asset) => asset.id));
          setBaseline(
            JSON.stringify({
              capsuleId: memory.capsuleId,
              type: memory.type,
              title: memory.title,
              description: memory.description ?? '',
              body: memory.body ?? '',
              tags: memory.tags.join(', '),
              assets: memory.assets.map((asset) => asset.id),
            }),
          );
        } else {
          const nextType = types.includes(requestedType as MemoryType) ? (requestedType as MemoryType) : 'LETTER';
          const ownsRequested = capsuleList.some((capsule) => capsule.id === requestedCapsule);
          const first = ownsRequested && requestedCapsule ? requestedCapsule : (capsuleList[0]?.id ?? '');
          setCapsuleId(first);
          setType(nextType);
          setNewCapsule(capsuleList.length === 0);
          setBaseline(JSON.stringify({ capsuleId: first, type: nextType, title: '', description: '', body: '', tags: '', assets: [] }));
        }
      } catch (reason) {
        if (reason instanceof ApiError && reason.status === 401) {
          router.replace('/login');
          return;
        }
        if (!cancelled) setError(reason instanceof ApiError ? reason.message : 'This memory could not be opened.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [memoryId, requestedCapsule, requestedType, router, status]);

  async function createCapsule(event?: FormEvent) {
    event?.preventDefault();
    setError('');
    if (capsuleTitle.trim().length < 2) {
      setError('Enter a capsule title.');
      return;
    }
    setPending(true);
    try {
      const created = await api<Capsule>('/api/capsules', {
        method: 'POST',
        body: JSON.stringify({ title: capsuleTitle.trim(), description: capsuleDescription.trim() || null }),
      });
      setCapsules((current) => [created, ...current]);
      setCapsuleId(created.id);
      setCapsuleTitle('');
      setCapsuleDescription('');
      setNewCapsule(false);
      setMessage('Capsule created. You can now save a memory inside it.');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'The capsule could not be created.');
    } finally {
      setPending(false);
    }
  }

  async function changeType(next: MemoryType) {
    if (next === type) return;
    setError('');
    const sessionUploads = assets.filter((asset) => !originalAssetIds.includes(asset.id) && !asset.id.startsWith('local-'));
    await Promise.all(sessionUploads.map((asset) => api(`/api/media/${asset.id}`, { method: 'DELETE' }).catch(() => undefined)));
    if (assets.length) setMessage('Selected files were cleared because the memory type changed.');
    setAssets([]);
    setType(next);
  }

  async function onFiles(fileList: FileList | null) {
    if (!fileList?.length || type === 'LETTER') return;
    const kind = type as UploadKind;
    const selected = [...fileList];
    const room = kind === 'PHOTO' ? 12 - assets.length : 1 - assets.length;
    if (room <= 0) {
      setError(kind === 'PHOTO' ? 'A photo memory can include up to 12 images.' : 'This memory can include one file.');
      return;
    }
    setError('');
    setUploading(true);
    for (const file of selected.slice(0, room)) {
      const problem = fileError(file, kind);
      if (problem) {
        setError(problem);
        continue;
      }
      const placeholder = `local-${file.name}-${file.size}`;
      setAssets((current) => [...current, { id: placeholder, originalName: file.name, mimeType: file.type, sizeBytes: file.size, kind, progress: 1 }]);
      try {
        const saved = await uploadFile(file, kind, (progress) => {
          setAssets((current) => current.map((asset) => (asset.id === placeholder ? { ...asset, progress } : asset)));
        });
        setAssets((current) => current.map((asset) => (asset.id === placeholder ? { ...saved, progress: undefined } : asset)));
      } catch (reason) {
        setAssets((current) => current.filter((asset) => asset.id !== placeholder));
        setError(reason instanceof Error ? reason.message : 'The file could not be uploaded.');
      }
    }
    setUploading(false);
  }

  async function removeAsset(id: string) {
    setAssets((current) => current.filter((asset) => asset.id !== id));
    if (!originalAssetIds.includes(id) && !id.startsWith('local-')) {
      await api(`/api/media/${id}`, { method: 'DELETE' }).catch(() => undefined);
    }
  }

  async function discard() {
    const extras = assets.filter((asset) => !originalAssetIds.includes(asset.id) && !asset.id.startsWith('local-'));
    await Promise.all(extras.map((asset) => api(`/api/media/${asset.id}`, { method: 'DELETE' }).catch(() => undefined)));
    router.push('/');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!capsuleId) {
      setError('Create a capsule before saving a memory.');
      return;
    }
    if (title.trim().length < 2) {
      setError('Enter a memory title.');
      return;
    }
    if (type === 'LETTER' && body.trim().length < 1) {
      setError('Write the letter before saving.');
      return;
    }
    if (type !== 'LETTER' && assets.filter((asset) => !asset.id.startsWith('local-')).length < 1) {
      setError('Add a file before saving.');
      return;
    }
    if (uploading) {
      setError('Wait for the upload to finish.');
      return;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      type,
      body: type === 'LETTER' ? body : null,
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      capsuleId,
      assetIds: assets.filter((asset) => !asset.id.startsWith('local-')).map((asset) => asset.id),
    };

    setPending(true);
    try {
      if (memoryId) {
        await api(`/api/memories/${memoryId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        router.push('/?notice=updated');
      } else {
        await api('/api/memories', { method: 'POST', body: JSON.stringify(payload) });
        router.push('/?notice=saved');
      }
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'The memory could not be saved.');
      setPending(false);
    }
  }

  if (status !== 'authenticated' || loading) {
    return <p>Loading the memory form…</p>;
  }

  return (
    <form className="mx-auto min-w-0 max-w-3xl" onSubmit={save} data-testid="memory-form">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-tide">{memoryId ? 'Edit memory' : 'New memory'}</p>
      <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">{memoryId ? 'Edit your memory' : 'Create a memory'}</h1>
      <p className="mt-3 text-sm leading-6 text-ink/70">
        This saves a private draft. It does not send the memory to anyone or schedule a release.
      </p>

      {message ? (
        <p className="mt-4 rounded-2xl bg-moss/10 px-4 py-3 text-sm text-moss" role="status" data-testid="form-message">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-2xl bg-clay/10 px-4 py-3 text-sm text-clay" role="alert" data-testid="form-error">
          {error}
        </p>
      ) : null}

      <section className="mt-6 rounded-3xl border border-line bg-card p-5 shadow-card">
        <h2 className="font-serif text-2xl font-semibold">Capsule</h2>
        {capsules.length === 0 ? (
          <p className="mt-2 text-sm leading-6 text-ink/70">A capsule holds one or more memories. Create one before saving this memory.</p>
        ) : (
          <label className="mt-4 block text-sm font-semibold" htmlFor="capsule-id">
            Choose a capsule
            <select id="capsule-id" className={fieldClass} value={capsuleId} data-testid="capsule-select" onChange={(event) => setCapsuleId(event.target.value)}>
              {capsules.map((capsule) => (
                <option key={capsule.id} value={capsule.id}>
                  {capsule.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {capsules.length > 0 ? (
          <button type="button" className="mt-3 text-sm font-semibold text-tide" onClick={() => setNewCapsule((value) => !value)}>
            {newCapsule ? 'Hide new capsule' : 'Create a new capsule'}
          </button>
        ) : null}
        {newCapsule || capsules.length === 0 ? (
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-semibold" htmlFor="capsule-title">
              Capsule title
              <input id="capsule-title" className={fieldClass} value={capsuleTitle} data-testid="capsule-title" onChange={(event) => setCapsuleTitle(event.target.value)} />
            </label>
            <label className="block text-sm font-semibold" htmlFor="capsule-description">
              Capsule description (optional)
              <textarea id="capsule-description" className={`${fieldClass} min-h-24`} value={capsuleDescription} data-testid="capsule-description" onChange={(event) => setCapsuleDescription(event.target.value)} />
            </label>
            <button type="button" className={secondaryButton} data-testid="save-capsule" disabled={pending} onClick={() => void createCapsule()}>
              {pending ? 'Saving…' : 'Create capsule'}
            </button>
          </div>
        ) : null}
      </section>

      <fieldset className="mt-6">
        <legend className="font-serif text-2xl font-semibold">Memory type</legend>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {types.map((item) => (
            <button
              key={item}
              type="button"
              className={`min-h-11 rounded-2xl border px-3 text-sm font-semibold ${type === item ? 'border-tide bg-tide text-white' : 'border-line bg-card'}`}
              data-testid={`type-${item}`}
              onClick={() => void changeType(item)}
            >
              {TYPE_LABEL[item]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-6 block text-sm font-semibold" htmlFor="memory-title">
        Title
        <input id="memory-title" className={fieldClass} value={title} data-testid="field-title" onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="mt-4 block text-sm font-semibold" htmlFor="memory-description">
        Description (optional)
        <textarea id="memory-description" className={`${fieldClass} min-h-24`} value={description} data-testid="field-description" onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label className="mt-4 block text-sm font-semibold" htmlFor="memory-tags">
        Tags (optional)
        <input id="memory-tags" className={fieldClass} value={tags} placeholder="family, birthday" data-testid="field-tags" onChange={(event) => setTags(event.target.value)} />
      </label>

      {type === 'LETTER' ? (
        <label className="mt-4 block text-sm font-semibold" htmlFor="memory-body">
          Letter
          <textarea id="memory-body" className={`${fieldClass} min-h-64 font-serif text-lg leading-8`} value={body} data-testid="field-body" onChange={(event) => setBody(event.target.value)} />
        </label>
      ) : (
        <div className="mt-4 rounded-3xl border border-dashed border-line bg-card p-5">
          <label className="block cursor-pointer">
            <span className="font-semibold">{type === 'PHOTO' ? 'Upload images' : `Upload ${TYPE_LABEL[type].toLowerCase()}`}</span>
            <span className="mt-1 block text-sm font-normal leading-6 text-ink/70">
              {type === 'PHOTO'
                ? 'Choose one or more JPG or PNG pictures. You can remove any image before saving.'
                : type === 'VIDEO'
                  ? 'Choose an MP4, MOV, or WEBM video.'
                  : type === 'AUDIO'
                    ? 'Choose an MP3, WAV, M4A, OGG, or WEBM recording.'
                    : 'Choose a PDF, DOC, DOCX, or TXT file.'}
            </span>
            <input
              className="mt-3 block w-full text-sm"
              type="file"
              accept={ACCEPT[type]}
              multiple={type === 'PHOTO'}
              data-testid="upload-input"
              onChange={(event) => {
                void onFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
          <ul className="mt-4 space-y-3">
            {assets.map((asset) => (
              <li key={asset.id} className="min-w-0 rounded-2xl bg-paper p-3" data-testid="asset-row">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 break-all text-sm font-semibold" data-testid="asset-name">
                    {asset.originalName}
                  </p>
                  <button type="button" className="min-h-11 shrink-0 px-2 text-sm font-semibold text-clay" onClick={() => void removeAsset(asset.id)}>
                    Remove
                  </button>
                </div>
                {asset.progress ? (
                  <p className="mt-2 text-sm text-tide" data-testid="upload-progress">
                    Uploading {asset.progress}%
                  </p>
                ) : null}
                {asset.kind === 'PHOTO' && !asset.progress ? (
                  // The content route checks the signed-in owner before streaming the private file.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/media/${asset.id}/content`} alt="" className="mt-3 max-h-48 w-auto max-w-full rounded-xl" />
                ) : null}
                {asset.kind === 'VIDEO' && !asset.progress ? <video className="mt-3 max-h-48 w-full rounded-xl" controls src={`/api/media/${asset.id}/content`} /> : null}
                {asset.kind === 'AUDIO' && !asset.progress ? <audio className="mt-3 w-full" controls src={`/api/media/${asset.id}/content`} /> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button type="submit" className={primaryButton} disabled={pending || uploading} data-testid="save-draft">
          {pending ? 'Saving…' : 'Save as Draft'}
        </button>
        <button type="button" className={secondaryButton} data-testid="cancel-memory" onClick={() => (dirty ? setConfirmLeave(true) : router.push('/'))}>
          Cancel
        </button>
      </div>

      {confirmLeave ? (
        <div className="mt-4 rounded-2xl border border-line bg-sand p-4" role="dialog" aria-label="Discard unsaved changes">
          <p className="text-sm">You have unsaved changes. Leave without saving?</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button type="button" className="inline-flex min-h-11 items-center justify-center rounded-full bg-clay px-4 font-semibold text-white" data-testid="discard-confirm" onClick={() => void discard()}>
              Discard changes
            </button>
            <button type="button" className={secondaryButton} onClick={() => setConfirmLeave(false)}>
              Keep editing
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

const fieldClass = 'mt-1.5 min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-base';
const primaryButton = 'inline-flex min-h-11 items-center justify-center rounded-full bg-tide px-5 font-semibold text-white disabled:opacity-60';
const secondaryButton = 'inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-white px-5 font-semibold';
