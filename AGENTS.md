<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application structure
- Keep IntelliClass frontend-only until explicitly authorized to connect services; controls must never imply successful persistence or real device control.
- Use explicit flat role-prefixed route files with shared WorkspaceShell and WorkspacePage views so each requested screen is independently navigable and has its own metadata.
- Keep illustrative records confined to labeled overview screens; operational directories and session views use honest disconnected empty states.
- Define visual roles as global semantic CSS tokens and share design-system controls across public and workspace screens to keep presentation consistent.
