import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/student/notifications')({
  head: () => pageMeta('Notifications', 'IntelliClass student workspace. ' + descriptions['notifications']),
  component: Page,
});
function Page() { return <WorkspacePage role="student" page="notifications"/>; }
