import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import classroom from "@/assets/classroom.jpg";
import { ApiRequestError, useAuth } from "./auth-provider";
import { Brand, Field } from "./shared";

type ResetPasswordPageProps = {
  token: string | undefined;
};

export function ResetPasswordPage({ token }: ResetPasswordPageProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("");
  const { requestJson } = useAuth();
  const navigate = useNavigate();
  const validToken = typeof token === "string" && token.length >= 32 && token.length <= 256;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!validToken) {
      setMessage("This password reset link is invalid or expired. Request a new link.");
      return;
    }
    if (password !== confirmation) {
      setMessage("The passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await requestJson("auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      setComplete(true);
      setMessage("Your password has been updated. You can now sign in.");
    } catch (error) {
      setMessage(
        error instanceof ApiRequestError
          ? error.message
          : "We couldn't update your password. Request a new reset link and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-main">
        <Link to="/" className="auth-brand">
          <Brand />
        </Link>
        <div className="auth-form-wrap">
          <Link to="/forgot-password" className="back-link">
            <ArrowLeft size={16} />
            Request a new link
          </Link>
          <span className="auth-symbol">
            <LockKeyhole size={25} />
          </span>
          <div className="eyebrow">YOUR CONNECTED CLASSROOM</div>
          <h1>Reset your password.</h1>
          <p>Choose a new password for your IntelliClass account.</p>

          {complete ? (
            <>
              <div className="auth-notice" role="status">
                <ShieldCheck size={18} />
                <span>{message}</span>
              </div>
              <Button className="w-full h-11" onClick={() => navigate({ to: "/login" })}>
                Back to login <ArrowRight />
              </Button>
            </>
          ) : !validToken ? (
            <div className="auth-notice" role="alert">
              <ShieldCheck size={18} />
              <span>
                This password reset link is missing, invalid, or expired. Request a new link.
              </span>
            </div>
          ) : (
            <form onSubmit={submit}>
              <Field label="New password">
                <span className="password-field">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 12 characters"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </Button>
                </span>
              </Field>
              <Field label="Confirm new password">
                <input
                  type="password"
                  placeholder="Enter the new password again"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </Field>
              <p className="text-sm text-muted-foreground">Reset links expire after 30 minutes.</p>
              <Button type="submit" className="w-full h-11" disabled={busy}>
                {busy ? "Please wait…" : "Save new password"}
                <ArrowRight />
              </Button>
              {message && (
                <div className="auth-notice" role="alert">
                  <ShieldCheck size={18} />
                  <span>{message}</span>
                </div>
              )}
            </form>
          )}
          <div className="auth-preview">
            <span>Need help? Contact your institution administrator.</span>
          </div>
        </div>
        <span className="auth-copyright">© 2026 IntelliClass</span>
      </div>
      <aside className="auth-image">
        <img
          src={classroom}
          width={1600}
          height={912}
          alt="Connected learning in a university classroom"
        />
        <div>
          <span className="hero-eyebrow">BUILT AROUND PEOPLE</span>
          <h2>
            Great classrooms.
            <br />
            Start with connection.
          </h2>
          <p>
            Your people, your classes, your insights.
            <br />
            Together in one thoughtful workspace.
          </p>
        </div>
      </aside>
    </div>
  );
}
