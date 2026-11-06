import type { Metadata } from 'next';
import { CapsuleManager } from '@/components/CapsuleManager';

export const metadata: Metadata = { title: 'Capsules · Digi Capsule' };

export default function CapsulesPage() {
  return <CapsuleManager />;
}
