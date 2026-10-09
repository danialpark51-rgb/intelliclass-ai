import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/student/my-classes')({
  head: () => pageMeta('My Classes', 'IntelliClass student workspace. ' + descriptions['my-classes']),
  component: Page,
});
function Page() { return <WorkspacePage role="student" page="my-classes"/>; }
