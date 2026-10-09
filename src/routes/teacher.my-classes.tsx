import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/teacher/my-classes')({
  head: () => pageMeta('My Classes', 'IntelliClass teacher workspace. ' + descriptions['my-classes']),
  component: Page,
});
function Page() { return <WorkspacePage role="teacher" page="my-classes"/>; }
