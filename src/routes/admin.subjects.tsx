import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/admin/subjects')({
  head: () => pageMeta('Subjects', 'IntelliClass admin workspace. ' + descriptions['subjects']),
  component: Page,
});
function Page() { return <WorkspacePage role="admin" page="subjects"/>; }
