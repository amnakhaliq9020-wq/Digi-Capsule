import type { Metadata } from 'next';
import { ActivityList } from '@/components/ActivityList';

export const metadata: Metadata = { title: 'Activity · Digi Capsule' };

export default function ActivityPage() {
  return <ActivityList />;
}
