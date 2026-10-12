import { useEffect, useState, type FormEvent } from "react";
import { Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiRequestError, useAuth } from "./auth-provider";
import { Field, Panel } from "./shared";

type InstitutionOption = { id: string; name: string };
type InvitationRole = "STUDENT" | "TEACHER" | "SUPER_ADMIN";
type CreatedInvitation = {
  email: string;
  role: InvitationRole;
  token: string;
  expiresAt: string;
};

function getError(error: unknown) {
  return error instanceof ApiRequestError
    ? error.message
    : "The invitation service could not be reached. Please try again.";
}

export function RegistrationInvitations({
  isSuperAdmin,
  institutionId,
  institutions,
}: {
  isSuperAdmin: boolean;
  institutionId: string;
  institutions: InstitutionOption[];
}) {
  const { requestJson } = useAuth();
  const [open, setOpen] = useState(false);
  const [targetInstitutionId, setTargetInstitutionId] = useState(institutionId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InvitationRole>("STUDENT");
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (institutionId && !targetInstitutionId) setTargetInstitutionId(institutionId);
  }, [institutionId, targetInstitutionId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    setCreatedInvitation(null);
    try {
      const result = await requestJson<{ data: CreatedInvitation }>("auth/registration-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          role,
          ...(isSuperAdmin ? { institutionId: targetInstitutionId } : {}),
        }),
      });
      setCreatedInvitation(result.data);
      setNotice(
        "Invitation created. Creating another for the same email and role will revoke this code.",
      );
    } catch (cause) {
      setError(getError(cause));
    } finally {
      setSaving(false);
    }
  }

  async function copyCode() {
    if (!createdInvitation) return;
    try {
      await navigator.clipboard.writeText(createdInvitation.token);
      setNotice("Invitation code copied.");
    } catch {
      setNotice("Copy is unavailable in this browser. Select and copy the code below.");
    }
  }

  const hasInstitution = isSuperAdmin ? Boolean(targetInstitutionId) : Boolean(institutionId);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen((current) => !current);
          setError("");
        }}
      >
        <Plus size={16} />
        Invite user
      </Button>
      {open && (
        <Panel
          title="Invite a user"
          subtitle={
            isSuperAdmin
              ? "Issue a one-time signup code. Global Admin invitations can only be issued by a Super Admin."
              : "Invite students and teachers to your institution."
          }
          action={
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          }
        >
          <form className="grid gap-4 p-4 md:grid-cols-2" onSubmit={submit}>
            {isSuperAdmin && (
              <Field label="Institution for invitation audit">
                <select
                  required
                  value={targetInstitutionId}
                  onChange={(event) => {
                    setTargetInstitutionId(event.target.value);
                    setCreatedInvitation(null);
                  }}
                >
                  <option value="">Choose an institution</option>
                  {institutions.map((institution) => (
                    <option key={institution.id} value={institution.id}>
                      {institution.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Email address">
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={320}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setCreatedInvitation(null);
                }}
              />
            </Field>
            <Field label="Role">
              <select
                required
                value={role}
                onChange={(event) => {
                  setRole(event.target.value as InvitationRole);
                  setCreatedInvitation(null);
                }}
              >
                <option value="STUDENT">Student</option>
                <option value="TEACHER">Teacher</option>
                {isSuperAdmin && <option value="SUPER_ADMIN">Global Admin</option>}
              </select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={saving || !hasInstitution}>
                {saving ? "Creating…" : "Create invitation"}
              </Button>
            </div>
          </form>
          {(error || notice) && (
            <p className={error ? "auth-notice m-4" : "m-4 text-sm text-muted-foreground"} role="status">
              {error || notice}
            </p>
          )}
          {createdInvitation && (
            <div className="grid gap-3 p-4 pt-0">
              <Field label="One-time invitation code">
                <div className="flex gap-2">
                  <input value={createdInvitation.token} readOnly aria-label="Invitation code" />
                  <Button type="button" variant="outline" onClick={() => void copyCode()}>
                    <Copy size={15} />
                    Copy
                  </Button>
                </div>
              </Field>
              <p className="text-xs text-muted-foreground">
                Send this code to {createdInvitation.email}. It expires{" "}
                {new Date(createdInvitation.expiresAt).toLocaleString()} and is shown only once.
              </p>
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
