import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen, CalendarDays, ClipboardCheck, GraduationCap, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, ApiRequestError } from "./auth-provider";
import { LoadingState, Panel } from "./shared";
import type { Role } from "@/lib/intelliclass";
import classroom from "@/assets/classroom.jpg";

type Summary = {
  scope: string;
  timeZone: string;
  metrics: {
    students: number;
    teachers: number;
    classes: number;
    sessionsToday: number;
    attendancePresent: number;
    attendanceTotal: number;
    attendancePercent: number | null;
  };
};

export function ConnectedDashboard({ role }: { role: Role }) {
  const { user, requestJson } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const admin = role === "admin";
  const teacher = role === "teacher";

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await requestJson<{ data: Summary }>("dashboard/summary");
      setSummary(result.data);
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError
          ? cause.message
          : "The dashboard could not reach the service. Try again in a moment.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [user?.id]);

  const metrics = summary?.metrics;
  const attendance = metrics?.attendancePercent === null || metrics?.attendancePercent === undefined
    ? "No data"
    : `${metrics.attendancePercent}%`;
  const stats = admin
    ? [
        ["Active students", metrics?.students, Users, "mint"],
        ["Active teachers", metrics?.teachers, GraduationCap, "lavender"],
        ["Classes", metrics?.classes, BookOpen, "peach"],
        ["Sessions today", metrics?.sessionsToday, CalendarDays, "blue"],
      ]
    : teacher
      ? [
          ["My classes", metrics?.classes, BookOpen, "mint"],
          ["Student enrollments", metrics?.students, Users, "lavender"],
          ["Sessions today", metrics?.sessionsToday, CalendarDays, "peach"],
          ["Attendance today", attendance, ClipboardCheck, "blue"],
        ]
      : [
          ["My classes", metrics?.classes, BookOpen, "mint"],
          ["Sessions today", metrics?.sessionsToday, CalendarDays, "peach"],
          ["Present today", `${metrics?.attendancePresent ?? 0} / ${metrics?.attendanceTotal ?? 0}`, ClipboardCheck, "lavender"],
          ["Attendance today", attendance, Users, "blue"],
        ];

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR CAMPUS, CONNECTED</div>
          <h1>{admin ? "Institution overview" : teacher ? "Your teaching overview" : "Your learning overview"}<span className="heading-dot">.</span></h1>
          <p>{admin ? "Live counts from your institution." : teacher ? "Your assigned classes and today's classroom activity." : "Your enrolled classes and today's attendance."}</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>Refresh</Button>
      </div>
      <section className="welcome-banner">
        <img src={classroom} width={1600} height={912} alt="Students learning together in a university classroom" />
        <div className="welcome-banner-content">
          <span className="welcome-tag"><span/> {user?.firstName ? `Welcome back, ${user.firstName}` : "Your connected classroom"}</span>
          <h2>{admin ? "Great classrooms." : "Great learning."}<br/>Start with connection.</h2>
          <p>{admin ? "Manage your institution's people and classes in one workspace." : teacher ? "Your classes and today's attendance are connected here." : "Your classes and attendance are connected here."}</p>
          <Button asChild><Link to={admin ? "/admin/classes" : teacher ? "/teacher/my-classes" : "/student/my-classes"}>{admin ? "Manage classes" : "View my classes"}<ArrowUpRight size={16}/></Link></Button>
        </div>
      </section>
      {error && <div className="auth-notice" role="alert">{error} <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button></div>}
      {loading && !summary ? <LoadingState/> : <>
        <div className="stats-grid">
          {stats.map(([label, value, Icon, color]) => {
            const StatIcon = Icon as typeof Users;
            const display = value === undefined ? "—" : String(value);
            const note = display === "No data" ? "No attendance records for today" : label === "Sessions today" ? `Institution time: ${summary?.timeZone ?? "UTC"}` : "Live database count";
            return (
              <article className="stat-card" key={String(label)}>
                <div className="stat-top"><span>{String(label)}</span><span className={`stat-icon tone-${String(color)}`}><StatIcon size={19}/></span></div>
                <strong>{display}</strong><p>{note}</p>
              </article>
            );
          })}
        </div>
        <div className="dashboard-middle">
          <Panel title="Attendance today" subtitle={`Based on records marked today in ${summary?.timeZone ?? "UTC"}`}>
            {metrics?.attendanceTotal ? (
              <div className="p-5">
                <strong className="text-3xl">{attendance}</strong>
                <p className="mt-2 text-sm text-muted-foreground">{metrics.attendancePresent} present out of {metrics.attendanceTotal} attendance records.</p>
              </div>
            ) : (
              <div className="p-5 text-sm text-muted-foreground">No attendance has been recorded today. No percentage is shown until records exist.</div>
            )}
          </Panel>
          <Panel title="Today's sessions" subtitle={`Calendar day in ${summary?.timeZone ?? "UTC"}`}>
            {metrics ? (
              <div className="p-5">
                <strong className="text-3xl">{metrics.sessionsToday}</strong>
                <p className="mt-2 text-sm text-muted-foreground">{metrics.sessionsToday === 1 ? "session is" : "sessions are"} scheduled for today.</p>
                {teacher && <Button className="mt-4" variant="outline" asChild><Link to="/teacher/my-schedule">View schedule<ArrowUpRight size={15}/></Link></Button>}
                {!teacher && <p className="mt-4 text-sm text-muted-foreground">Schedule details are available from the sessions workspace.</p>}
              </div>
            ) : <div className="p-5 text-sm text-muted-foreground">Session data is unavailable.</div>}
          </Panel>
        </div>
        <div className="dashboard-note"><span className="note-symbol"><BookOpen size={15}/></span><p>Dashboard totals reflect saved institution records, not sample data.</p><span>IntelliClass</span></div>
      </>}
    </>
  );
}
