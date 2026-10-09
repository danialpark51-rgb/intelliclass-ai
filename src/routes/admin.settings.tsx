import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/admin/settings')({
  head: () => pageMeta('Settings', 'IntelliClass admin workspace. ' + descriptions['settings']),
  component: Page,
});
function Page() { return <WorkspacePage role="admin" page="settings"/>; }
