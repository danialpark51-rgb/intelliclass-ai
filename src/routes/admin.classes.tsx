import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/admin/classes')({
  head: () => pageMeta('Classes', 'IntelliClass admin workspace. ' + descriptions['classes']),
  component: Page,
});
function Page() { return <WorkspacePage role="admin" page="classes"/>; }
