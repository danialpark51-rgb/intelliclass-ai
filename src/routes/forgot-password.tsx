import { createFileRoute } from '@tanstack/react-router';
import { AuthPage } from '@/components/intelliclass/public-pages';
import { pageMeta } from '@/lib/intelliclass';
export const Route = createFileRoute('/forgot-password')({
 head: () => pageMeta('Forgot Password', 'Forgot Password to your IntelliClass institution workspace.'),
 component: Page,
});
function Page() { return <AuthPage forgot={true}/>; }
