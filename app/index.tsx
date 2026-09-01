import { Redirect } from 'expo-router';
import { useSession } from '@/lib/auth/session';

export default function Index() {
  const session = useSession((s) => s.session);
  return <Redirect href={session ? '/home' : '/sign-in'} />;
}
