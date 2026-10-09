import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/teacher/start-class')({
  head: () => pageMeta('Start Class', 'IntelliClass teacher workspace. ' + descriptions['start-class']),
  component: Page,
});
function Page() { return <WorkspacePage role="teacher" page="start-class"/>; }
