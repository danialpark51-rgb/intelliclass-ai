import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/teacher/dashboard')({
  head: () => pageMeta('Teacher Dashboard', 'IntelliClass teacher workspace. ' + descriptions['dashboard']),
  component: Page,
});
function Page() { return <WorkspacePage role="teacher" page="dashboard"/>; }
