# Client routes

TanStack Router uses file-based routing for the static Vite SPA. Add page routes in this directory; `@tanstack/router-plugin` regenerates `src/routeTree.gen.ts` during Vite development and builds. Backend endpoints live in `supabase/functions/`, not in the route tree.
