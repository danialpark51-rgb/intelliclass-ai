import { createFileRoute } from '@tanstack/react-router';
import { AuthPage } from '@/components/intelliclass/public-pages';
import { pageMeta } from '@/lib/intelliclass';
export const Route = createFileRoute('/login')({
 head: () => pageMeta('Log in', 'Log in to your IntelliClass institution workspace.'),
 component: Page,
});
function Page() { return <AuthPage forgot=false/>; }
