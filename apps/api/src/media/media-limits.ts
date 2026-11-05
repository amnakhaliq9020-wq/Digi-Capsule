export type UploadKind = 'PHOTO' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';

export type Magic = { offset: number; bytes: number[] };

export type FileRule = {
  kind: UploadKind;
  extensions: string[];
  mimes: string[];
  magics: Magic[];
  plainText?: boolean;
};

const MB = 1024 * 1024;

function bytes(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function maxBytesFor(kind: UploadKind) {
  switch (kind) {
    case 'PHOTO':
      return bytes('MEDIA_PHOTO_MAX_BYTES', 10 * MB);
    case 'VIDEO':
      return bytes('MEDIA_VIDEO_MAX_BYTES', 100 * MB);
    case 'AUDIO':
      return bytes('MEDIA_AUDIO_MAX_BYTES', 25 * MB);
    case 'DOCUMENT':
      return bytes('MEDIA_DOCUMENT_MAX_BYTES', 20 * MB);
  }
}

export function maxUploadBytes() {
  return Math.max(maxBytesFor('PHOTO'), maxBytesFor('VIDEO'), maxBytesFor('AUDIO'), maxBytesFor('DOCUMENT'));
}

export function linkTtlSeconds() {
  return bytes('MEDIA_LINK_TTL_SECONDS', 300);
}

const jpeg: Magic[] = [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }];
const png: Magic[] = [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47] }];
const ftyp: Magic[] = [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }];
const webm: Magic[] = [{ offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] }];
const id3: Magic[] = [
  { offset: 0, bytes: [0x49, 0x44, 0x33] },
  { offset: 0, bytes: [0xff, 0xfb] },
  { offset: 0, bytes: [0xff, 0xf3] },
  { offset: 0, bytes: [0xff, 0xf2] },
];
const riff: Magic[] = [{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }];
const ogg: Magic[] = [{ offset: 0, bytes: [0x4f, 0x67, 0x67, 0x53] }];
const pdf: Magic[] = [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }];
const ole: Magic[] = [{ offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0] }];
const zip: Magic[] = [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }];

export const FILE_RULES: FileRule[] = [
  { kind: 'PHOTO', extensions: ['.jpg', '.jpeg'], mimes: ['image/jpeg'], magics: jpeg },
  { kind: 'PHOTO', extensions: ['.png'], mimes: ['image/png'], magics: png },
  { kind: 'VIDEO', extensions: ['.mp4'], mimes: ['video/mp4'], magics: ftyp },
  { kind: 'VIDEO', extensions: ['.mov'], mimes: ['video/quicktime'], magics: ftyp },
  { kind: 'VIDEO', extensions: ['.webm'], mimes: ['video/webm'], magics: webm },
  { kind: 'AUDIO', extensions: ['.mp3'], mimes: ['audio/mpeg'], magics: id3 },
  { kind: 'AUDIO', extensions: ['.wav'], mimes: ['audio/wav', 'audio/wave', 'audio/x-wav'], magics: riff },
  { kind: 'AUDIO', extensions: ['.m4a'], mimes: ['audio/mp4', 'audio/x-m4a'], magics: ftyp },
  { kind: 'AUDIO', extensions: ['.ogg'], mimes: ['audio/ogg'], magics: ogg },
  { kind: 'AUDIO', extensions: ['.webm'], mimes: ['audio/webm'], magics: webm },
  { kind: 'DOCUMENT', extensions: ['.pdf'], mimes: ['application/pdf'], magics: pdf },
  { kind: 'DOCUMENT', extensions: ['.doc'], mimes: ['application/msword'], magics: ole },
  {
    kind: 'DOCUMENT',
    extensions: ['.docx'],
    mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    magics: zip,
  },
  { kind: 'DOCUMENT', extensions: ['.txt'], mimes: ['text/plain'], magics: [], plainText: true },
];

export function matchesMagic(header: Buffer, magics: Magic[]) {
  return magics.some((magic) => magic.bytes.every((byte, index) => header[magic.offset + index] === byte));
}

export function isPlainText(header: Buffer) {
  return !header.includes(0);
}
