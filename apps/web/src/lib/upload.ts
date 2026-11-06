import { UploadKind } from '@/lib/types';

const MB = 1024 * 1024;

export const MAX_BYTES: Record<UploadKind, number> = {
  PHOTO: 10 * MB,
  VIDEO: 100 * MB,
  AUDIO: 25 * MB,
  DOCUMENT: 20 * MB,
};

export const ACCEPT: Record<UploadKind, string> = {
  PHOTO: '.jpg,.jpeg,.png,image/jpeg,image/png',
  VIDEO: '.mp4,.mov,.webm,video/mp4,video/quicktime,video/webm',
  AUDIO: '.mp3,.wav,.m4a,.ogg,.webm,audio/*',
  DOCUMENT: '.pdf,.doc,.docx,.txt,application/pdf,text/plain',
};

const EXTENSIONS: Record<UploadKind, string[]> = {
  PHOTO: ['.jpg', '.jpeg', '.png'],
  VIDEO: ['.mp4', '.mov', '.webm'],
  AUDIO: ['.mp3', '.wav', '.m4a', '.ogg', '.webm'],
  DOCUMENT: ['.pdf', '.doc', '.docx', '.txt'],
};

export function fileError(file: File, kind: UploadKind) {
  const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
  if (!EXTENSIONS[kind].includes(extension)) {
    if (kind === 'PHOTO') return 'Use a JPG or PNG image.';
    if (kind === 'VIDEO') return 'Use an MP4, MOV, or WEBM video.';
    if (kind === 'AUDIO') return 'Use an MP3, WAV, M4A, OGG, or WEBM audio file.';
    return 'Use a PDF, DOC, DOCX, or TXT document.';
  }
  if (file.size > MAX_BYTES[kind]) return 'This file is larger than the allowed size.';
  return '';
}

export function uploadFile(file: File, kind: UploadKind, onProgress: (value: number) => void) {
  const data = new FormData();
  data.append('kind', kind);
  data.append('file', file);

  return new Promise<{ id: string; originalName: string; mimeType: string; sizeBytes: number; kind: UploadKind }>(
    (resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/media');
      xhr.withCredentials = true;
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.max(1, Math.round((event.loaded / event.total) * 100)));
      };
      xhr.onload = () => {
        let body: { message?: string; id?: string } = {};
        try {
          body = JSON.parse(xhr.responseText || '{}') as { message?: string; id?: string };
        } catch {
          body = {};
        }
        if (xhr.status >= 200 && xhr.status < 300 && body.id) {
          resolve(body as { id: string; originalName: string; mimeType: string; sizeBytes: number; kind: UploadKind });
          return;
        }
        reject(new Error(body.message || 'The file could not be uploaded.'));
      };
      xhr.onerror = () => reject(new Error('The file could not be uploaded.'));
      onProgress(1);
      xhr.send(data);
    },
  );
}
