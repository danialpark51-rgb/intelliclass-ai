import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/teacher/my-schedule')({
  head: () => pageMeta('My Schedule', 'IntelliClass teacher workspace. ' + descriptions['my-schedule']),
  component: Page,
});
function Page() { return <WorkspacePage role="teacher" page="my-schedule"/>; }
