import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/admin/teachers')({
  head: () => pageMeta('Teachers', 'IntelliClass admin workspace. ' + descriptions['teachers']),
  component: Page,
});
function Page() { return <WorkspacePage role="admin" page="teachers"/>; }
