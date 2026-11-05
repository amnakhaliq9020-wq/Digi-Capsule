export type AccountUser = {
  id: string;
  email: string;
  name: string;
};

export type ContactRole = 'RECIPIENT' | 'TRUSTED_CONTACT' | 'VERIFIER';

export type Contact = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: ContactRole;
  slot: number;
  updatedAt: string;
};

export type ContactInput = {
  fullName: string;
  email: string;
  phone: string;
};

export type MemoryType = 'LETTER' | 'PHOTO' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
export type MemoryStatus = 'DRAFT' | 'SCHEDULED' | 'RELEASED';
export type UploadKind = Exclude<MemoryType, 'LETTER'>;

export type Capsule = {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { memories: number };
};

export type MediaAsset = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  kind: MemoryType;
  memoryItemId?: string | null;
};

export type MemorySummary = {
  id: string;
  title: string;
  description: string | null;
  preview: string;
  type: MemoryType;
  status: MemoryStatus;
  capsuleId: string;
  capsuleTitle: string;
  createdAt: string;
  updatedAt: string;
};

export type MemoryDetail = {
  id: string;
  title: string;
  description: string | null;
  type: MemoryType;
  body: string | null;
  tags: string[];
  status: MemoryStatus;
  capsuleId: string;
  createdAt: string;
  updatedAt: string;
  capsule: { id: string; title: string };
  assets: MediaAsset[];
};

export const TYPE_LABEL: Record<MemoryType, string> = {
  LETTER: 'Letter',
  PHOTO: 'Photo',
  VIDEO: 'Video',
  AUDIO: 'Audio',
  DOCUMENT: 'Document',
};

export const STATUS_LABEL: Record<MemoryStatus, string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  RELEASED: 'Released',
};
