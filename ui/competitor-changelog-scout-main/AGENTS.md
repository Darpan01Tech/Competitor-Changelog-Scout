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

- Keep review payload construction and pending/verification rules in the browser-safe review module so exact decision fields can be tested independently.
- Reviewers enter their name in the existing public queue; column-scoped update grants restrict review writes, while workflow verification remains read-only in the app.
