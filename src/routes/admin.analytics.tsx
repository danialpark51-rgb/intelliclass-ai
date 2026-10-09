import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/admin/analytics')({
  head: () => pageMeta('Analytics', 'IntelliClass admin workspace. ' + descriptions['analytics']),
  component: Page,
});
function Page() { return <WorkspacePage role="admin" page="analytics"/>; }
