import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/admin/dashboard')({
  head: () => pageMeta('Admin Dashboard', 'IntelliClass admin workspace. ' + descriptions['dashboard']),
  component: Page,
});
function Page() { return <WorkspacePage role="admin" page="dashboard"/>; }
