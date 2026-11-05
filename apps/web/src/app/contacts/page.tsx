import type { Metadata } from 'next';
import { ContactsManager } from '@/components/ContactsManager';

export const metadata: Metadata = {
  title: 'My Contacts · Digi Capsule',
  description: 'Manage the people connected to your Digi Capsule.',
};

export default function ContactsPage() {
  return <ContactsManager />;
}
