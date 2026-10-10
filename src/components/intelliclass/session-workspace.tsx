import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ApiRequestError, useAuth } from "./auth-provider";
import { DataTable, EmptyState, Field, LoadingState, Panel, StatusBadge } from "./shared";
import type { Role } from "@/lib/intelliclass";

type Page<T> = { data: T[] };
type Session = {
  id: string;
  classId: string;
  title: string;
  status: "SCHEDULED" | "ACTIVE" | "ENDED" | "CANCELLED";
  startsAt: string;
  endsAt: string | null;
  timeZone: string;
  class: { id: string; name: string; code: string | null };
  teacher: { id: string; firstName: string; lastName: string };
  subject: { id: string; name: string; code: string };
};
type ClassRecord = {
  id: string;
  name: string;
  code: string | null;
  subjects: { subjectId: string }[];
};
type Subject = { id: string; name: string; code: string | null };
type Student = { id: string; student: { id: string; firstName: string; lastName: string } };
type Attendance = {
  studentId: string;
  status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
  note: string | null;
  markedAt: string;
  student?: { id: string; firstName: string; lastName: string };
};

function errorText(error: unknown) {
  return error instanceof ApiRequestError ? error.message : "The server could not be reached. Please retry.";
}

export function SessionWorkspace({ page, role }: { page: string; role: Role }) {
  const { requestJson } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [existingAttendance, setExistingAttendance] = useState<Attendance[]>([]);
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, string>>({});
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canTeach = role === "teacher";
  const isAttendance = page === "attendance";
  const isCreate = page === "start-class";
  const titleText = isAttendance ? "Attendance" : isCreate ? "Start a class" : page === "current-session" ? "Current sessions" : "My schedule";
  const selectedClassRecord = classes.find((record) => record.id === selectedClass);
  const availableSubjects = useMemo(
    () => subjects.filter((subject) => selectedClassRecord?.subjects.some((assignment) => assignment.subjectId === subject.id)),
    [selectedClassRecord, subjects],
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [sessionResult, classResult, subjectResult] = await Promise.all([
        requestJson<Page<Session>>("sessions?page=1&pageSize=100"),
        requestJson<Page<ClassRecord>>("classes?page=1&pageSize=100"),
        requestJson<Page<Subject>>("subjects?page=1&pageSize=100"),
      ]);
      setSessions(sessionResult.data);
      setClasses(classResult.data);
      setSubjects(subjectResult.data);
      if (!selectedClass && classResult.data[0]) setSelectedClass(classResult.data[0].id);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function mutateSession(session: Session, action: "start" | "end") {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await requestJson(`sessions/${session.id}/${action}`, { method: "POST" });
      setNotice(`Session ${action === "start" ? "started" : "ended"}.`);
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  }

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await requestJson("sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedClass,
          subjectId: selectedSubject,
          title,
          startsAt: new Date(startsAt).toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        }),
      });
      setTitle("");
      setStartsAt("");
      setNotice("Session scheduled.");
      await load();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  }

  async function openAttendance(session: Session) {
    setSelectedSession(session);
    setError("");
    try {
      const attendance = await requestJson<Page<Attendance>>(`sessions/${session.id}/attendance`);
      if (role === "student") {
        setStudents([]);
      } else {
        const roster = await requestJson<Page<Student>>(
          `classes/${session.classId}/enrollments?page=1&pageSize=200`,
        );
        setStudents(roster.data);
      }
      setExistingAttendance(attendance.data);
      setAttendanceDraft(Object.fromEntries(attendance.data.map((record) => [record.studentId, record.status])));
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  async function saveAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSession) return;
    const records = students.flatMap(({ student }) => {
      const status = attendanceDraft[student.id];
      return status ? [{ studentId: student.id, status }] : [];
    });
    if (!records.length || records.length !== students.length) {
      setError("Select an attendance status for each enrolled student before saving.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await requestJson(`sessions/${selectedSession.id}/attendance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      });
      setNotice("Attendance saved.");
      await openAttendance(selectedSession);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">CLASSROOM SESSIONS</div><h1>{titleText}<span className="heading-dot">.</span></h1><p>Sessions and attendance are loaded from your authorized class assignments.</p></div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>Refresh</Button>
      </div>
      {(error || notice) && <div className={error ? "auth-notice" : "status-badge status-success"} role={error ? "alert" : "status"}>{error || notice}</div>}
      {isCreate && canTeach && (
        <Panel title="Schedule a class session" subtitle="The class and subject must be assigned to your teacher account.">
          <form onSubmit={createSession} className="grid gap-4 p-4 md:grid-cols-2">
            <Field label="Class"><select required value={selectedClass} onChange={(event) => { setSelectedClass(event.target.value); setSelectedSubject(""); }}><option value="">Select a class</option>{classes.map((record) => <option key={record.id} value={record.id}>{record.name}{record.code ? ` · ${record.code}` : ""}</option>)}</select></Field>
            <Field label="Subject"><select required value={selectedSubject} onChange={(event) => setSelectedSubject(event.target.value)}><option value="">Select a subject</option>{availableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></Field>
            <Field label="Session title"><input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Introduction to biology"/></Field>
            <Field label="Start time"><input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)}/></Field>
            <Button type="submit" disabled={saving || !classes.length || !availableSubjects.length} className="md:col-span-2">{saving ? "Scheduling…" : "Schedule session"}</Button>
          </form>
          {!classes.length && <div className="px-4 pb-4 text-sm text-muted-foreground">Your account needs an assigned class before a session can be scheduled.</div>}
        </Panel>
      )}
      {loading && sessions.length === 0 ? <LoadingState/> : (
        <Panel title={isAttendance ? "Sessions to take attendance" : "Your sessions"} subtitle={`${sessions.length} session${sessions.length === 1 ? "" : "s"} returned for your account`}>
          {sessions.length === 0 ? (
            <EmptyState title="No sessions found" description="Schedule a class session or ask your institution administrator to assign one."/>
          ) : (
            <DataTable headers={["Session", "Class & subject", "Teacher", "Starts", "Status", "Actions"]}>
              {sessions.map((session) => (
                <tr key={session.id}>
                  <td><strong>{session.title}</strong></td>
                  <td>{session.class.name}<div className="text-xs text-muted-foreground">{session.subject.name}</div></td>
                  <td>{session.teacher.firstName} {session.teacher.lastName}</td>
                  <td>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: session.timeZone }).format(new Date(session.startsAt))}</td>
                  <td><StatusBadge tone={session.status === "ACTIVE" ? "success" : session.status === "SCHEDULED" ? "info" : "neutral"}>{session.status}</StatusBadge></td>
                  <td className="flex flex-wrap gap-2">
                    {canTeach && session.status === "SCHEDULED" && <Button size="sm" disabled={saving} onClick={() => void mutateSession(session, "start")}>Start</Button>}
                    {canTeach && session.status === "ACTIVE" && <Button size="sm" variant="outline" disabled={saving} onClick={() => void mutateSession(session, "end")}>End</Button>}
                    {canTeach && (session.status === "ACTIVE" || session.status === "ENDED") && <Button size="sm" variant="outline" onClick={() => void openAttendance(session)}>Attendance</Button>}
                    {role === "student" && <Button size="sm" variant="outline" onClick={() => void openAttendance(session)}>My attendance</Button>}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>
      )}
      {selectedSession && (
        <Panel title={`${role === "student" ? "My attendance" : "Take attendance"} · ${selectedSession.title}`} subtitle={role === "student" ? "Only your attendance record is visible." : "Choose a status for every enrolled student and save."}>
          {role === "student" ? (
            existingAttendance.length === 0 ? <EmptyState title="No attendance record" description="No attendance has been recorded for this session yet."/> :
            <DataTable headers={["Session", "Status", "Marked"]}>
              {existingAttendance.map((entry) => <tr key={entry.studentId}><td>{selectedSession.title}</td><td><StatusBadge>{entry.status}</StatusBadge></td><td>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: selectedSession.timeZone }).format(new Date(entry.markedAt))}</td></tr>)}
            </DataTable>
          ) : students.length === 0 ? <EmptyState title="No enrolled students" description="There are no enrolled students for this class, or the roster could not be loaded."/> : (
            <form onSubmit={saveAttendance}>
              <DataTable headers={["Student", "Attendance status"]}>
                {students.map(({ student }) => (
                  <tr key={student.id}><td>{student.firstName} {student.lastName}</td><td><select required aria-label={`Attendance for ${student.firstName} ${student.lastName}`} value={attendanceDraft[student.id] ?? ""} onChange={(event) => setAttendanceDraft((current) => ({ ...current, [student.id]: event.target.value }))}><option value="">Choose status</option><option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="LATE">Late</option><option value="EXCUSED">Excused</option></select></td></tr>
                ))}
              </DataTable>
              <div className="flex gap-2 p-4"><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save attendance"}</Button><Button type="button" variant="outline" onClick={() => setSelectedSession(null)}>Close</Button></div>
            </form>
          )}
          {role === "student" && <div className="p-4"><Button variant="outline" onClick={() => setSelectedSession(null)}>Close</Button></div>}
        </Panel>
      )}
    </>
  );
}
