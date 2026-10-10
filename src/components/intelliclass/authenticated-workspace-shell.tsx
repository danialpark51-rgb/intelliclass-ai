import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu, PanelLeftClose, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { navigation, type Role } from "@/lib/intelliclass";
import { useAuth } from "./auth-provider";
import { Brand } from "./shared";
import type { WorkspacePath } from "./workspace-shell";

export function AuthenticatedWorkspaceShell({
  role,
  children,
}: {
  role: Role;
  children: ReactNode;
}) {
  const [mobile, setMobile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const menu = navigation[role];
  const current = menu.find(([slug]) => pathname.endsWith(`/${slug}`));
  const name = user ? `${user.firstName} ${user.lastName}`.trim() : "Account";
  const initials = user ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase() : "IC";

  async function logout() {
    setSigningOut(true);
    await signOut();
    await navigate({ to: "/login", replace: true });
  }

  return (
    <div className="workspace">
      <div className={`sidebar-backdrop ${mobile ? "visible" : ""}`} onClick={() => setMobile(false)} />
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <Link to="/"><Brand /></Link>
          <Button variant="ghost" size="icon" className="mobile-close" onClick={() => setMobile(false)} aria-label="Close navigation"><X /></Button>
        </div>
        <div className="institution-switch">
          <span className="institution-icon"><PanelLeftClose size={18} /></span>
          <span className="text-left"><strong>IntelliClass</strong><small>{role === "admin" ? "Institution admin" : `${role} workspace`}</small></span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label={`${role} navigation`}>
          {menu.map(([slug, label, Icon]) => (
            <Link
              key={slug}
              to={`/${role}/${slug}` as WorkspacePath}
              onClick={() => setMobile(false)}
              className={`sidebar-link ${pathname === `/${role}/${slug}` ? "active" : ""}`}
            >
              <Icon size={19} /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-profile">
            <span className="avatar">{initials}</span>
            <span className="text-left"><strong>{name}</strong><small>{user?.email ?? ""}</small></span>
          </div>
          <Button variant="outline" className="w-full justify-between" onClick={() => void logout()} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}<LogOut size={16} />
          </Button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="mobile-menu" onClick={() => setMobile(true)} aria-label="Open navigation"><Menu /></Button>
            <PanelLeftClose className="desktop-panel text-muted-foreground" size={18} />
            <span className="breadcrumb">Workspace <span>/</span> <strong>{current?.[1] ?? "Overview"}</strong></span>
          </div>
          <div className="topbar-actions"><span className="avatar small" aria-label={`Signed in as ${name}`}>{initials}</span></div>
        </header>
        <main className="workspace-content">{children}</main>
        <footer className="workspace-footer"><span>© 2026 IntelliClass</span><span>Thoughtfully built for better learning.</span></footer>
      </div>
    </div>
  );
}
