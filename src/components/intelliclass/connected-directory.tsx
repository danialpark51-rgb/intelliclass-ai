import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Eye, Pencil, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiRequestError, useAuth } from "./auth-provider";
import { DataTable, EmptyState, Field, LoadingState, Panel, StatusBadge } from "./shared";
import type { Role } from "@/lib/intelliclass";

type Page<T> = {
  data: T[];
  pagination?: { page: number; totalPages: number; total: number };
};
type Institution = { id: string; name: string };
type UserRecord = {
  id: string;
  institutionId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  status: "ACTIVE" | "SUSPENDED" | string;
  role: string;
};
type TeacherOption = Pick<UserRecord, "id" | "firstName" | "lastName">;
type SubjectRecord = { id: string; name: string; code: string | null };
type ClassRecord = {
  id: string;
  institutionId: string;
  name: string;
  code: string | null;
  teachers: { teacherId: string }[];
  subjects: { subjectId: string }[];
  _count: { enrollments: number; sessions: number };
};

function getError(error: unknown) {
  return error instanceof ApiRequestError
    ? error.message
    : "The server could not be reached. Please try again.";
}

function qs(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return query.size ? `?${query.toString()}` : "";
}

export function ConnectedDirectory({
  page,
  role,
}: {
  page: string;
  role: Role;
}) {
  const { user, requestJson } = useAuth();
  const isAdmin = role === "admin";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isClassDirectory = page === "classes" || page === "my-classes";
  const isSubjectDirectory = page === "subjects";
  const isUserDirectory = page === "students" || page === "teachers";
  const userRole = page === "students" ? "STUDENT" : "TEACHER";
  const title = isClassDirectory
    ? isAdmin
      ? "Classes"
      : "My classes"
    : isSubjectDirectory
      ? "Subjects"
      : page === "students"
        ? "Students"
        : "Teachers";

  const [records, setRecords] = useState<(UserRecord | ClassRecord | SubjectRecord)[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectRecord[]>([]);
  const [institutionId, setInstitutionId] = useState(user?.institutionId ?? "");
  const [pageNumber, setPageNumber] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<UserRecord | ClassRecord | SubjectRecord | null>(null);
  const [viewing, setViewing] = useState<UserRecord | ClassRecord | null>(null);
  const [viewLoadingId, setViewLoadingId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    name: "",
    code: "",
    teacherIds: [] as string[],
    subjectIds: [] as string[],
  });

  useEffect(() => {
    if (!isSuperAdmin) return;
    let active = true;
    void requestJson<Page<Institution>>("institutions?page=1&pageSize=100")
      .then((result) => {
        if (!active) return;
        setInstitutions(result.data);
        const firstInstitution = result.data[0];
        if (!institutionId && firstInstitution) setInstitutionId(firstInstitution.id);
      })
      .catch((cause) => {
        if (active) setError(getError(cause));
      });
    return () => {
      active = false;
    };
  }, [institutionId, isSuperAdmin, requestJson]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const endpoint = isClassDirectory ? "classes" : isSubjectDirectory ? "subjects" : userRole === "STUDENT" ? "students" : "teachers";
    void requestJson<Page<UserRecord | ClassRecord | SubjectRecord>>(
      `${endpoint}${qs({ page: pageNumber, pageSize: 25, ...(isSuperAdmin ? { institutionId: institutionId || undefined } : {}) })}`,
    )
      .then((result) => {
        if (!active) return;
        setRecords(result.data);
        setTotalPages(result.pagination?.totalPages ?? 1);
        setTotal(result.pagination?.total ?? result.data.length);
      })
      .catch((cause) => {
        if (active) setError(getError(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [institutionId, isClassDirectory, isSubjectDirectory, isSuperAdmin, pageNumber, requestJson, userRole]);

  useEffect(() => {
    if (!isAdmin || !isClassDirectory) return;
    let active = true;
    const scope = isSuperAdmin ? qs({ institutionId: institutionId || undefined }) : "";
    void Promise.all([
      requestJson<Page<TeacherOption>>(`teachers?page=1&pageSize=100${scope}`),
      requestJson<Page<SubjectRecord>>(`subjects?page=1&pageSize=100${scope}`),
    ])
      .then(([teacherResult, subjectResult]) => {
        if (!active) return;
        setTeachers(teacherResult.data);
        setSubjects(subjectResult.data);
      })
      .catch((cause) => {
        if (active) setError(getError(cause));
      });
    return () => {
      active = false;
    };
  }, [institutionId, isAdmin, isClassDirectory, isSuperAdmin, requestJson]);

  function beginCreate() {
    setEditing(null);
    setForm({
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      name: "",
      code: "",
      teacherIds: [],
      subjectIds: [],
    });
    setNotice("");
    setShowForm(true);
  }

  function beginEdit(record: UserRecord | ClassRecord | SubjectRecord) {
    setEditing(record);
    setNotice("");
    if ("email" in record) {
      setForm({
        firstName: record.firstName,
        lastName: record.lastName,
        email: record.email,
        password: "",
        name: "",
        code: "",
        teacherIds: [],
        subjectIds: [],
      });
    } else if ("teachers" in record) {
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        name: record.name,
        code: record.code ?? "",
        teacherIds: record.teachers.map((entry) => entry.teacherId),
        subjectIds: record.subjects.map((entry) => entry.subjectId),
      });
    } else {
      setForm({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        name: record.name,
        code: record.code ?? "",
        teacherIds: [],
        subjectIds: [],
      });
    }
    setShowForm(true);
  }

  async function openDetails(record: UserRecord | ClassRecord) {
    const endpoint = isClassDirectory ? "classes" : userRole === "STUDENT" ? "students" : "teachers";
    setViewLoadingId(record.id);
    setError("");
    try {
      const result = await requestJson<{ data: UserRecord | ClassRecord }>(`${endpoint}/${record.id}`);
      setViewing(result.data);
    } catch (cause) {
      setError(getError(cause));
    } finally {
      setViewLoadingId("");
    }
  }

  function updateList(preserveNotice = false) {
    setPageNumber(1);
    if (!preserveNotice) setNotice("");
    setError("");
    // Refreshing by changing the page state is insufficient when already on page one.
    void requestJson<Page<UserRecord | ClassRecord | SubjectRecord>>(
      `${isClassDirectory ? "classes" : isSubjectDirectory ? "subjects" : userRole === "STUDENT" ? "students" : "teachers"}${qs({ page: pageNumber, pageSize: 25, ...(isSuperAdmin ? { institutionId: institutionId || undefined } : {}) })}`,
    )
      .then((result) => {
        setRecords(result.data);
        setTotal(result.pagination?.total ?? result.data.length);
        setTotalPages(result.pagination?.totalPages ?? 1);
      })
      .catch((cause) => setError(getError(cause)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const endpoint = isClassDirectory ? "classes" : isSubjectDirectory ? "subjects" : userRole === "STUDENT" ? "students" : "teachers";
    const classBody = {
      institutionId: isSuperAdmin ? institutionId : user?.institutionId,
      name: form.name,
      code: form.code || undefined,
      teacherIds: form.teacherIds,
      subjectIds: form.subjectIds,
    };
    const body = isClassDirectory
      ? classBody
      : isSubjectDirectory
        ? { institutionId: isSuperAdmin ? institutionId : user?.institutionId, name: form.name, code: form.code || undefined }
        : editing
          ? { firstName: form.firstName, lastName: form.lastName, email: form.email }
          : {
              institutionId: isSuperAdmin ? institutionId : user?.institutionId,
              firstName: form.firstName,
              lastName: form.lastName,
              email: form.email,
              password: form.password,
            };
    try {
      if (editing) {
        const id = editing.id;
        const patch = isClassDirectory
          ? { name: form.name, code: form.code || null, teacherIds: form.teacherIds, subjectIds: form.subjectIds }
          : isSubjectDirectory
            ? { name: form.name, code: form.code }
            : body;
        await requestJson(`${endpoint}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
      } else {
        await requestJson(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isUserDirectory ? { ...body, role: userRole } : body),
        });
      }
      setShowForm(false);
      setEditing(null);
      setNotice(`${title.slice(0, -1)} ${editing ? "updated" : "created"}.`);
      updateList(true);
    } catch (cause) {
      setError(getError(cause));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(record: UserRecord | ClassRecord | SubjectRecord) {
    const message = "email" in record
      ? `Deactivate ${record.firstName} ${record.lastName}? They will lose access, but their records will be retained.`
      : `Delete ${"name" in record ? record.name : "this record"}? This action cannot be undone.`;
    if (!window.confirm(message)) return;
    setError("");
    try {
      const endpoint = isClassDirectory ? "classes" : isSubjectDirectory ? "subjects" : userRole === "STUDENT" ? "students" : "teachers";
      await requestJson(`${endpoint}/${record.id}`, { method: "DELETE" });
      setNotice("email" in record ? "The account was deactivated." : "The record was deleted.");
      updateList(true);
    } catch (cause) {
      setError(getError(cause));
    }
  }

  const canCreate = isAdmin && (isClassDirectory || isSubjectDirectory || isUserDirectory);
  const heading = (
    <div className="page-heading">
      <div>
        <div className="eyebrow">CONNECTED DIRECTORY</div>
        <h1>{title}<span className="heading-dot">.</span></h1>
        <p>{isClassDirectory ? "Class records and their current assignments." : isSubjectDirectory ? "Subjects configured for your institution." : "Institution-managed accounts and access status."}</p>
      </div>
      {canCreate && <Button onClick={beginCreate}><Plus size={16}/>Add {title.slice(0, -1)}</Button>}
    </div>
  );
  const institutionSelector = isSuperAdmin && (
    <Field label="Institution">
      <select value={institutionId} onChange={(event) => { setInstitutionId(event.target.value); setPageNumber(1); }} aria-label="Select institution">
        <option value="">All institutions</option>
        {institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}
      </select>
    </Field>
  );
  if (loading && records.length === 0) return <>{heading}<LoadingState/></>;

  return (
    <>
      {heading}
      {(error || notice) && <div className={error ? "auth-notice" : "status-badge status-success"} role="status">{error || notice}</div>}
      <Panel
        title={`${title} directory`}
        subtitle={`${total} record${total === 1 ? "" : "s"}${!isAdmin ? " assigned to your account" : ""}`}
        action={<Button size="sm" variant="outline" onClick={() => updateList()} aria-label="Refresh directory"><RefreshCw size={15}/>Refresh</Button>}
      >
        {institutionSelector}
        {loading ? <LoadingState/> : records.length === 0 ? (
          <EmptyState
            icon={Users}
            title={`No ${title.toLowerCase()} yet`}
            description={error ? "The directory could not be loaded. Check your connection and retry." : "There are no records in this directory yet."}
          >
            {canCreate && <Button onClick={beginCreate}><Plus size={15}/>Add the first record</Button>}
          </EmptyState>
        ) : isClassDirectory ? (
          <DataTable headers={["Class", "Teachers", "Subjects", "Students", "Sessions", "Actions"]}>
            {(records as ClassRecord[]).map((record) => (
              <tr key={record.id}>
                <td><strong>{record.name}</strong><div className="text-xs text-muted-foreground">{record.code || "No class code"}</div></td>
                <td>{record.teachers.length}</td><td>{record.subjects.length}</td>
                <td>{record._count.enrollments}</td><td>{record._count.sessions}</td>
                <td className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={viewLoadingId === record.id} onClick={() => void openDetails(record)} aria-label={`View ${record.name}`}><Eye size={14}/></Button>
                  {canCreate && <><Button size="sm" variant="outline" onClick={() => beginEdit(record)} aria-label={`Edit ${record.name}`}><Pencil size={14}/></Button><Button size="sm" variant="outline" onClick={() => void deactivate(record)} aria-label={`Delete ${record.name}`}><Trash2 size={14}/></Button></>}
                </td>
              </tr>
            ))}
          </DataTable>
        ) : isSubjectDirectory ? (
          <DataTable headers={["Subject", "Code", ...(canCreate ? ["Actions"] : [])]}>
            {(records as SubjectRecord[]).map((record) => (
              <tr key={record.id}><td><strong>{record.name}</strong></td><td>{record.code || "—"}</td>
                {canCreate && <td className="flex gap-2"><Button size="sm" variant="outline" onClick={() => beginEdit(record)} aria-label={`Edit ${record.name}`}><Pencil size={14}/></Button><Button size="sm" variant="outline" onClick={() => void deactivate(record)} aria-label={`Delete ${record.name}`}><Trash2 size={14}/></Button></td>}
              </tr>
            ))}
          </DataTable>
        ) : (
          <DataTable headers={["Name", "Email", "Status", "Actions"]}>
            {(records as UserRecord[]).map((record) => (
              <tr key={record.id}><td><strong>{record.firstName} {record.lastName}</strong></td><td>{record.email}</td><td><StatusBadge tone={record.status === "ACTIVE" ? "success" : "warning"}>{record.status}</StatusBadge></td>
                <td className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={viewLoadingId === record.id} onClick={() => void openDetails(record)} aria-label={`View ${record.firstName} ${record.lastName}`}><Eye size={14}/></Button>
                  {canCreate && <><Button size="sm" variant="outline" onClick={() => beginEdit(record)} aria-label={`Edit ${record.firstName} ${record.lastName}`}><Pencil size={14}/></Button>{record.status === "ACTIVE" && <Button size="sm" variant="outline" onClick={() => void deactivate(record)} aria-label={`Deactivate ${record.firstName} ${record.lastName}`}><Trash2 size={14}/></Button>}</>}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
        {totalPages > 1 && <div className="flex items-center justify-end gap-2 p-4"><span className="text-sm text-muted-foreground">Page {pageNumber} of {totalPages}</span><Button size="sm" variant="outline" disabled={pageNumber <= 1} onClick={() => setPageNumber(pageNumber - 1)}><ArrowLeft size={14}/>Previous</Button><Button size="sm" variant="outline" disabled={pageNumber >= totalPages} onClick={() => setPageNumber(pageNumber + 1)}>Next<ArrowRight size={14}/></Button></div>}
      </Panel>
      {viewing && (
        <Panel
          title={"email" in viewing ? `${viewing.firstName} ${viewing.lastName}` : viewing.name}
          subtitle={"email" in viewing ? "Account details loaded from the institution database." : "Class details loaded from the institution database."}
          action={<Button size="sm" variant="outline" onClick={() => setViewing(null)}>Close</Button>}
        >
          <dl className="grid gap-4 p-4 sm:grid-cols-2">
            {"email" in viewing ? (
              <>
                <div><dt className="text-sm text-muted-foreground">Email</dt><dd className="font-medium">{viewing.email}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Role</dt><dd className="font-medium">{viewing.role}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Status</dt><dd className="font-medium">{viewing.status}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Account ID</dt><dd className="break-all font-medium">{viewing.id}</dd></div>
              </>
            ) : (
              <>
                <div><dt className="text-sm text-muted-foreground">Class code</dt><dd className="font-medium">{viewing.code || "Not set"}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Assigned teachers</dt><dd className="font-medium">{viewing.teachers.length}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Subjects</dt><dd className="font-medium">{viewing.subjects.length}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Enrolled students</dt><dd className="font-medium">{viewing._count.enrollments}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Sessions</dt><dd className="font-medium">{viewing._count.sessions}</dd></div>
                <div><dt className="text-sm text-muted-foreground">Class ID</dt><dd className="break-all font-medium">{viewing.id}</dd></div>
              </>
            )}
          </dl>
        </Panel>
      )}
      {showForm && <Panel title={`${editing ? "Edit" : "Add"} ${title.slice(0, -1)}`} subtitle={isUserDirectory ? editing ? "Update account details. Deactivation is available from the directory." : "Set an initial password and share it through a secure channel." : "Changes are saved to the institution database."}>
        <form className="grid gap-4 p-4 md:grid-cols-2" onSubmit={submit}>
          {isUserDirectory ? <>
            <Field label="First name"><input required maxLength={100} value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })}/></Field>
            <Field label="Last name"><input required maxLength={100} value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })}/></Field>
            <Field label="Email"><input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}/></Field>
            {!editing && <Field label="Initial password"><input required type="password" minLength={12} maxLength={72} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })}/></Field>}
          </> : <>
            <Field label="Name"><input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></Field>
            <Field label="Code"><input maxLength={40} required={isSubjectDirectory} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })}/></Field>
            {isClassDirectory && <>
              <Field label="Teachers"><select multiple value={form.teacherIds} onChange={(event) => setForm({ ...form, teacherIds: Array.from(event.target.selectedOptions, (option) => option.value) })}>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>)}</select></Field>
              <Field label="Subjects"><select multiple value={form.subjectIds} onChange={(event) => setForm({ ...form, subjectIds: Array.from(event.target.selectedOptions, (option) => option.value) })}>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></Field>
            </>}
          </>}
          <div className="flex gap-2 md:col-span-2"><Button type="submit" disabled={saving || (isSuperAdmin && !institutionId)}>{saving ? "Saving…" : editing ? "Save changes" : `Create ${title.slice(0, -1).toLowerCase()}`}</Button><Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button></div>
        </form>
      </Panel>}
    </>
  );
}
