import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/teacher/attendance')({
  head: () => pageMeta('Attendance', 'IntelliClass teacher workspace. ' + descriptions['attendance']),
  component: Page,
});
function Page() { return <WorkspacePage role="teacher" page="attendance"/>; }
