import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/student/dashboard')({
  head: () => pageMeta('Student Dashboard', 'IntelliClass student workspace. ' + descriptions['dashboard']),
  component: Page,
});
function Page() { return <WorkspacePage role="student" page="dashboard"/>; }
