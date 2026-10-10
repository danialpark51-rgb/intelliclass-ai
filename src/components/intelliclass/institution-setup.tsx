import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useAuth, ApiRequestError } from "./auth-provider";
import { EmptyState, Field, LoadingState, Panel } from "./shared";

type Institution = { id: string; name: string; timeZone: string };

function messageFor(error: unknown) {
  return error instanceof ApiRequestError
    ? error.message
    : "The server could not be reached. Please retry.";
}

export function InstitutionSetup() {
  const { user, requestJson } = useAuth();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [timeZone, setTimeZone] = useState("Asia/Kolkata");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(user?.role === "SUPER_ADMIN");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  async function loadInstitutions() {
    const result = await requestJson<{ data: Institution[] }>("institutions?page=1&pageSize=100");
    setInstitutions(result.data);
    if (!selected && result.data[0]) setSelected(result.data[0].id);
  }

  useEffect(() => {
    if (!isSuperAdmin) return;
    let active = true;
    setLoading(true);
    void requestJson<{ data: Institution[] }>("institutions?page=1&pageSize=100")
      .then((result) => {
        if (!active) return;
        setInstitutions(result.data);
        if (result.data[0]) setSelected((current) => current || result.data[0]!.id);
      })
      .catch((cause) => {
        if (active) setError(messageFor(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isSuperAdmin, requestJson]);

  async function createInstitution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await requestJson<{ data: Institution }>("institutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, timeZone }),
      });
      setInstitutions((current) => [result.data, ...current]);
      setSelected(result.data.id);
      setName("");
      setNotice("Institution created.");
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setSaving(false);
    }
  }

  async function createAdministrator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await requestJson("users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institutionId: selected,
          role: "INSTITUTION_ADMIN",
          firstName,
          lastName,
          email,
          password,
        }),
      });
      setFirstName("");
      setLastName("");
      setEmail("");
      setPassword("");
      setNotice("Institution administrator created. Share the initial password through a separate secure channel.");
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">INSTITUTION SETTINGS</div><h1>Setup & access<span className="heading-dot">.</span></h1><p>Configure institutions and provision scoped administrator accounts.</p></div>
      </div>
      {(error || notice) && <div className={error ? "auth-notice" : "status-badge status-success"} role={error ? "alert" : "status"}>{error || notice}</div>}
      {!isSuperAdmin ? (
        <Panel title="Institution-managed workspace" subtitle="Institution administrator accounts are scoped to their own institution.">
          <EmptyState title="Institution setup is restricted" description="Only a Super Admin can create institutions or institution administrator accounts." />
        </Panel>
      ) : loading ? <LoadingState/> : <>
        <Panel title="Institutions" subtitle="Create a tenant and set its reporting timezone.">
          {institutions.length > 0 ? (
            <div className="grid gap-4 p-4 md:grid-cols-2">
              <Field label="Selected institution">
                <select value={selected} onChange={(event) => setSelected(event.target.value)}>
                  {institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name} — {institution.timeZone}</option>)}
                </select>
              </Field>
              <Button variant="outline" className="self-end" onClick={() => void loadInstitutions()}>Refresh institutions</Button>
            </div>
          ) : <div className="p-4 text-sm text-muted-foreground">No institution exists yet. Create one below.</div>}
          <form onSubmit={createInstitution} className="grid gap-4 border-t p-4 md:grid-cols-3">
            <Field label="Institution name"><input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <Field label="Reporting time zone"><input required maxLength={64} value={timeZone} onChange={(event) => setTimeZone(event.target.value)} placeholder="Asia/Kolkata" /></Field>
            <Button type="submit" className="self-end" disabled={saving}>{saving ? "Saving…" : "Create institution"}</Button>
          </form>
        </Panel>
        <Panel title="Provision an institution administrator" subtitle="New administrators can only manage users and records in the selected institution.">
          {!institutions.length ? <div className="p-4 text-sm text-muted-foreground">Create an institution before provisioning its administrator.</div> : (
            <form onSubmit={createAdministrator} className="grid gap-4 p-4 md:grid-cols-2">
              <Field label="First name"><input required maxLength={100} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></Field>
              <Field label="Last name"><input required maxLength={100} value={lastName} onChange={(event) => setLastName(event.target.value)} /></Field>
              <Field label="Email"><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
              <Field label="Initial password"><input required type="password" minLength={12} maxLength={72} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
              <Button type="submit" className="md:col-span-2" disabled={saving || !selected}>{saving ? "Saving…" : "Create institution admin"}</Button>
            </form>
          )}
        </Panel>
      </>}
    </>
  );
}
