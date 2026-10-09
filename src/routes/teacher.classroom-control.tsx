import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/teacher/classroom-control')({
  head: () => pageMeta('Classroom Control', 'IntelliClass teacher workspace. ' + descriptions['classroom-control']),
  component: Page,
});
function Page() { return <WorkspacePage role="teacher" page="classroom-control"/>; }
