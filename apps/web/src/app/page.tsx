import { Suspense } from 'react';
import { HomeDashboard } from '@/components/HomeDashboard';

export default function HomePage() {
  return (
    <Suspense fallback={<p>Loading your memories…</p>}>
      <HomeDashboard />
    </Suspense>
  );
}
