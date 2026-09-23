import type { Metadata } from 'next';
import { RlsTestHarness } from '@/features/security/rls-test-harness';

export const metadata: Metadata = {
  title: 'Temporary RLS Test Harness',
  robots: { index: false, follow: false },
};

export default function RlsTestPage() {
  return <RlsTestHarness />;
}
