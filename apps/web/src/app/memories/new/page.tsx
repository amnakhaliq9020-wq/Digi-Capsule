import { Suspense } from 'react';
import type { Metadata } from 'next';
import { MemoryForm } from '@/components/MemoryForm';

export const metadata: Metadata = { title: 'Create memory · Digi Capsule' };

export default function NewMemoryPage() {
  return (
    <Suspense fallback={<p>Loading the memory form…</p>}>
      <MemoryForm />
    </Suspense>
  );
}
