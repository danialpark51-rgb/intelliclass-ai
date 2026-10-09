import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/teacher/profile')({
  head: () => pageMeta('Profile', 'IntelliClass teacher workspace. ' + descriptions['profile']),
  component: Page,
});
function Page() { return <WorkspacePage role="teacher" page="profile"/>; }
