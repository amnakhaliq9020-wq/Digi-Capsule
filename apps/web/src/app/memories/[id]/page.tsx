import { Suspense } from 'react';
import type { Metadata } from 'next';
import { MemoryForm } from '@/components/MemoryForm';

export const metadata: Metadata = { title: 'Edit memory · Digi Capsule' };

export default async function EditMemoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<p>Loading the memory form…</p>}>
      <MemoryForm memoryId={id} />
    </Suspense>
  );
}
