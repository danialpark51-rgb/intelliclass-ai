import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/teacher/live-activity')({
  head: () => pageMeta('Live Activity', 'IntelliClass teacher workspace. ' + descriptions['live-activity']),
  component: Page,
});
function Page() { return <WorkspacePage role="teacher" page="live-activity"/>; }
