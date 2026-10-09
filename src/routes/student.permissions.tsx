import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/student/permissions')({
  head: () => pageMeta('Permissions', 'IntelliClass student workspace. ' + descriptions['permissions']),
  component: Page,
});
function Page() { return <WorkspacePage role="student" page="permissions"/>; }
