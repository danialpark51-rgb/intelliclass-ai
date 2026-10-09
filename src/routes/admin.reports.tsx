import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/admin/reports')({
  head: () => pageMeta('Reports', 'IntelliClass admin workspace. ' + descriptions['reports']),
  component: Page,
});
function Page() { return <WorkspacePage role="admin" page="reports"/>; }
