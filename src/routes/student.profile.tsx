import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/student/profile')({
  head: () => pageMeta('Profile', 'IntelliClass student workspace. ' + descriptions['profile']),
  component: Page,
});
function Page() { return <WorkspacePage role="student" page="profile"/>; }
