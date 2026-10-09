import { createFileRoute } from '@tanstack/react-router';
import { WorkspacePage } from '@/components/intelliclass/workspace-page';
import { pageMeta, descriptions } from '@/lib/intelliclass';
export const Route = createFileRoute('/teacher/ai-reports')({
  head: () => pageMeta('AI Reports', 'IntelliClass teacher workspace. ' + descriptions['ai-reports']),
  component: Page,
});
function Page() { return <WorkspacePage role="teacher" page="ai-reports"/>; }
