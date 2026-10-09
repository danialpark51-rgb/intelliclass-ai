import { createFileRoute } from "@tanstack/react-router";
import { Landing } from '@/components/intelliclass/public-pages';
import { pageMeta } from '@/lib/intelliclass';
export const Route = createFileRoute("/")({
  head: () => pageMeta('The Connected Classroom', 'A thoughtful classroom management workspace for administrators, teachers, and students. Connect your classes, attendance, and classroom insights with IntelliClass.'),
  component: Landing,
});
