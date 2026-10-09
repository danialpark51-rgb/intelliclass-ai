import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/student/current-session')({
  head: () => pageMeta('Current Session', 'IntelliClass student workspace. ' + descriptions['current-session']),
  component: Page,
});
function Page() { return <WorkspacePage role="student" page="current-session"/>; }
