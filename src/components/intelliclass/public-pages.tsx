import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, ArrowUpRight, BookOpen, ShieldCheck, Users, Sparkles, Check, Menu, X, GraduationCap, Eye, EyeOff, ArrowLeft, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Brand, Field } from './shared';
import classroom from '@/assets/classroom.jpg';
import { useAuth, authHome, ApiRequestError } from './auth-provider';
import { useNavigate } from '@tanstack/react-router';
export function PublicHeader(){const [open,setOpen]=useState(false);return <header className="public-header"><Link to="/"><Brand/></Link><nav className={open?'public-nav open':'public-nav'}><Link to="/">Home</Link><Link to="/admin/dashboard">Platform overview<ArrowUpRight size={13}/></Link><Link to="/teacher/dashboard">For educators<ArrowUpRight size={13}/></Link></nav><div className="flex items-center gap-3"><Button variant="ghost" asChild className="public-login"><Link to="/login">Log in<ArrowUpRight size={14}/></Link></Button><Button asChild><Link to="/admin/dashboard">Explore platform<ArrowRight/></Link></Button><Button variant="ghost" size="icon" className="mobile-menu" onClick={()=>setOpen(!open)} aria-label="Toggle navigation">{open?<X/>:<Menu/>}</Button></div></header>}
export function Landing(){return <div className="public-page"><PublicHeader/><main><section className="landing-hero"><img src={classroom} width={1600} height={912} alt="A teacher and university students working together in a modern classroom"/><div className="landing-hero-content"><span className="hero-eyebrow"><span/> THE CONNECTED CLASSROOM</span><h1>IntelliClass<span>.</span></h1><h2>More connection.<br/>More room to learn.</h2><p>One thoughtful workspace for your people,<br className="desktop-break"/> your classrooms, and everything in between.</p><div className="hero-buttons"><Button size="lg" asChild><Link to="/admin/dashboard">Explore the platform<ArrowUpRight/></Link></Button><Button variant="outline" size="lg" asChild><Link to="/login">Log in<ArrowRight/></Link></Button></div><div className="hero-assurance"><ShieldCheck size={16}/> Designed for institutions. Built around people.</div></div><div className="hero-bottom-label"><GraduationCap size={17}/><span>A smarter classroom.<br/><strong>A more connected campus.</strong></span></div></section><div className="purpose-strip"><span>LESS FRICTION. MORE FOCUS.</span><p>For the people who make learning happen.</p><span className="purpose-roles">Administrators <i/> Teachers <i/> Students</span></div><section className="platform-section"><div className="section-heading"><div><div className="eyebrow">EVERY CLASSROOM, IN SYNC</div><h2>Everything in its right place.</h2></div><p>From the first roll call to the final insight.<br/>A clearer picture of your institution.</p></div><div className="feature-grid">{[[BookOpen,'Classroom management','Plan sessions, organize classes, and give teachers a focused workspace.','mint'],[Users,'Attendance & activity','Keep classroom participation and student activity in view.','lavender'],[ShieldCheck,'Classroom control','Set the boundaries for focused learning with application permissions.','peach'],[Sparkles,'AI-powered insights','Bring classroom reports and teaching insights into one place.','blue']].map(([Icon,title,desc,tone])=>{const I=Icon as typeof BookOpen;return <article className="feature" key={String(title)}><span className={`feature-icon tone-${tone}`}><I size={25}/></span><h3>{String(title)}</h3><p>{String(desc)}</p></article>})}</div></section><section className="role-section"><div className="section-heading"><div><div className="eyebrow">ONE PLATFORM. THREE PERSPECTIVES.</div><h2>Your role. Your workspace.</h2></div><p>The right tools for every part<br/>of your learning community.</p></div><div className="role-grid">{[['admin','For administrators','A clear view of your institution.','Manage students, teachers, classes, and faculty allocation.'],['teacher','For teachers','More time for what you do best.','Prepare sessions, review attendance, and understand your classroom.'],['student','For students','Stay connected to your learning.','See your classes, current sessions, activity, and notifications.']].map(([role,title,headline,desc])=><article key={role}><span className="role-eyebrow">{title}</span><h3>{headline}</h3><p>{desc}</p><Button variant="outline" asChild><Link to={role==='admin'?'/admin/dashboard':role==='teacher'?'/teacher/dashboard':'/student/dashboard'}>Explore workspace<ArrowUpRight/></Link></Button></article>)}</div></section><section className="landing-cta"><Brand/><h2>A better-connected campus<br/>starts with IntelliClass.</h2><Button asChild size="lg"><Link to="/admin/dashboard">Take a look inside<ArrowRight/></Link></Button></section></main><footer className="public-footer"><Link to="/"><Brand/></Link><span>Thoughtfully built for better learning.</span><span>© 2026 IntelliClass</span></footer></div>}
export function AuthPage({ forgot = false, register = false }: { forgot?: boolean; register?: boolean }) {
  const [show, setShow] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupRole, setSignupRole] = useState<"STUDENT" | "TEACHER" | "ADMIN">("STUDENT");
  const [inviteToken, setInviteToken] = useState("");
  const [verifiedInvitation, setVerifiedInvitation] = useState<{
    email: string;
    role: "STUDENT" | "TEACHER" | "SUPER_ADMIN";
    expiresAt: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { signIn, signUp, continueAsGuest, requestJson } = useAuth();
  const navigate = useNavigate();

  async function verifyInvitation() {
    setBusy(true);
    setMessage("");
    setVerifiedInvitation(null);
    try {
      const result = await requestJson<{
        data: { email: string; role: string; expiresAt: string };
      }>("auth/registration-invitations/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken: inviteToken.trim() }),
      });
      if (!["STUDENT", "TEACHER", "SUPER_ADMIN"].includes(result.data.role)) {
        throw new ApiRequestError(
          "This invitation is not for Student, Teacher, or global Admin signup. Ask the issuer for the correct invitation.",
          403,
        );
      }
      const role = result.data.role as "STUDENT" | "TEACHER" | "SUPER_ADMIN";
      setVerifiedInvitation({ ...result.data, role });
      setEmail(result.data.email);
      setSignupRole(role === "SUPER_ADMIN" ? "ADMIN" : role);
      setMessage(`Invitation verified for ${result.data.email}.`);
    } catch (error) {
      setMessage(
        error instanceof ApiRequestError
          ? error.message
          : "Unable to verify this invitation. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (forgot) {
        await requestJson("auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        setMessage("If an account matches, password-reset instructions will be sent.");
      } else if (register) {
        if (!verifiedInvitation) {
          throw new ApiRequestError("Verify a valid invitation before creating your account.", 400);
        }
        const role = signupRole === "ADMIN" ? "SUPER_ADMIN" : signupRole;
        if (
          email.trim().toLowerCase() !== verifiedInvitation.email ||
          role !== verifiedInvitation.role
        ) {
          throw new ApiRequestError("The selected email and role must match your invitation.", 400);
        }
        const user = await signUp(
          fullName,
          email,
          password,
          verifiedInvitation.role,
          inviteToken.trim(),
        );
        await navigate({ to: authHome(user.role), replace: true });
      } else {
        const user = await signIn(email, password);
        await navigate({ to: authHome(user.role), replace: true });
      }
    } catch (error) {
      setMessage(
        error instanceof ApiRequestError
          ? error.message
          : "Unable to reach the authentication service. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function enterGuestPreview() {
    continueAsGuest();
    void navigate({ to: "/student/dashboard", replace: true });
  }

  return (
    <div className="auth-page">
      <div className="auth-main">
        <Link to="/" className="auth-brand"><Brand /></Link>
        <div className="auth-form-wrap">
          <Link to={forgot || register ? "/login" : "/"} className="back-link">
            <ArrowLeft size={16} />{forgot || register ? "Back to login" : "Back to home"}
          </Link>
          <span className="auth-symbol"><LockKeyhole size={25} /></span>
          <div className="eyebrow">YOUR CONNECTED CLASSROOM</div>
          <h1>{forgot ? "Forgot your password?" : register ? "Create your account." : "Welcome back."}</h1>
          <p>
            {forgot
              ? "Enter your institution email to request a reset link."
              : register
                ? "Create an account using an invitation from your institution."
                : "A little less admin. A little more learning."}
          </p>
          <form onSubmit={submit}>
            {register && (
              <Field label="Full name">
                <input
                  type="text"
                  placeholder="Your full name"
                  required
                  autoComplete="name"
                  maxLength={201}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </Field>
            )}
            {register && (
              <Field label="Role">
                <select
                  required
                  value={signupRole}
                  disabled={Boolean(verifiedInvitation)}
                  onChange={(event) =>
                    setSignupRole(event.target.value as "STUDENT" | "TEACHER" | "ADMIN")
                  }
                >
                  <option value="STUDENT">Student</option>
                  <option value="TEACHER">Teacher</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </Field>
            )}
            {register && (
              <Field label="Invitation code">
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    minLength={43}
                    maxLength={43}
                    autoComplete="off"
                    placeholder="Paste your one-time invitation code"
                    value={inviteToken}
                    onChange={(event) => {
                      setInviteToken(event.target.value.trim());
                      setVerifiedInvitation(null);
                      setMessage("");
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || inviteToken.trim().length !== 43}
                    onClick={() => void verifyInvitation()}
                  >
                    Verify
                  </Button>
                </div>
              </Field>
            )}
            <Field label="Email address">
              <input
                type="email"
                placeholder="name@institution.edu"
                required
                autoComplete="email"
                value={email}
                readOnly={register && Boolean(verifiedInvitation)}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            {register && (
              <p className="text-xs text-muted-foreground">
                Your invitation controls your role. Global Admin access requires an invitation
                issued by an existing Super Admin.
              </p>
            )}
            {!forgot && (
              <>
                <Field label="Password">
                  <span className="password-field">
                    <input
                      type={show ? "text" : "password"}
                      placeholder={register ? "At least 12 characters" : "Enter your password"}
                      required
                      autoComplete={register ? "new-password" : "current-password"}
                      minLength={12}
                      maxLength={72}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      type="button"
                      onClick={() => setShow(!show)}
                      aria-label={show ? "Hide password" : "Show password"}
                    >
                      {show ? <EyeOff /> : <Eye />}
                    </Button>
                  </span>
                </Field>
                {!register && (
                  <div className="login-options">
                    <span>Use your institution-provisioned account</span>
                    <Link to="/forgot-password">Forgot password?</Link>
                  </div>
                )}
              </>
            )}
            <Button type="submit" className="w-full h-11" disabled={busy}>
              {busy
                ? "Please wait…"
                : forgot
                  ? "Send reset link"
                  : register
                    ? "Create account"
                    : "Log in"}
              <ArrowRight />
            </Button>
            {!forgot && !register && (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11"
                  disabled={busy}
                  onClick={enterGuestPreview}
                >
                  Continue as Guest
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Student workspace preview. Institution data and account changes are unavailable.
                </p>
              </div>
            )}
            {!forgot && !register && (
              <p className="text-center text-sm">
                New to IntelliClass? <Link to="/register" className="font-medium text-primary">Create account</Link>
              </p>
            )}
            {register && (
              <p className="text-center text-sm">
                Already have an account? <Link to="/login" className="font-medium text-primary">Log in</Link>
              </p>
            )}
            {message && (
              <div className="auth-notice" role="status">
                <ShieldCheck size={18} /><span>{message}</span>
              </div>
            )}
          </form>
          <div className="auth-preview">
            <span>
              {register
                ? "Student and Teacher invitations are issued by institution administrators."
                : "Accounts are provisioned by your institution administrator."}
            </span>
          </div>
        </div>
        <span className="auth-copyright">© 2026 IntelliClass</span>
      </div>
      <aside className="auth-image">
        <img src={classroom} width={1600} height={912} alt="Connected learning in a university classroom" />
        <div>
          <span className="hero-eyebrow">BUILT AROUND PEOPLE</span>
          <h2>Great classrooms.<br />Start with connection.</h2>
          <p>Your people, your classes, your insights.<br />Together in one thoughtful workspace.</p>
        </div>
      </aside>
    </div>
  );
}
