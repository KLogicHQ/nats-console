import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect to dashboard - the dashboard layout will redirect to login if not authenticated
  redirect('/clusters');
}
