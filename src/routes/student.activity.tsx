import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/student/activity')({
  head: () => pageMeta('Activity', 'IntelliClass student workspace. ' + descriptions['activity']),
  component: Page,
});
function Page() { return <WorkspacePage role="student" page="activity"/>; }
