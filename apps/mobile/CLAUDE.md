# CLAUDE.md — apps/mobile

React Native (Expo) client for Brainrot Learning. Currently scaffolded only — feature work begins in Phase 2 (auth) of [implementation_plan.md](../../implementation_plan.md).

## Layout

`expo-router` with file-based routes under [app/](app/). Shared design tokens and components arrive in Phase 9.

```
app/
  _layout.tsx     Wraps the stack in <AuthProvider>
  index.tsx      Redirects to /home or /welcome based on auth status
  welcome.tsx    Unauthenticated landing
  sign-up.tsx    Registration form
  login.tsx      Login form
  home.tsx       Authenticated landing — shows /healthz status as a Phase-1 smoke test
src/
  auth/
    AuthContext.tsx   React Context exposing { user, status, signIn, signUp, signOut }
    validation.ts     Pure form validators (no React)
  lib/
    apiClient.ts      fetch wrapper, token storage, transparent /auth/refresh on 401
    secureStorage.ts  expo-secure-store on native, localStorage on web, getApiBaseUrl()
```

## Auth flow (Phase 2)

- Tokens persist via `expo-secure-store` on native, `localStorage` on web (`secureStorage.ts`).
- `apiClient.ts` attaches `Authorization: Bearer <accessToken>` when `auth: true`. On 401, it calls `/auth/refresh` once (deduped via `refreshInFlight`), retries, and clears local session on failure.
- `<AuthProvider>` boots in `loading`, calls `/auth/me` if a refresh token exists, then transitions to `authenticated` or `unauthenticated`.
- The root `index.tsx` reads that status and redirects. Logging out wipes tokens and bounces back to `/welcome`.

## API base URL

`getApiBaseUrl()` resolves in order: `EXPO_PUBLIC_API_URL` → Expo dev `hostUri` (LAN IP, port 4000) → `localhost:4000`. Set `EXPO_PUBLIC_API_URL` in [.env](../../.env) when running on a physical device against an API on a different host.

## Source-material upload (Phase 3)

- `app/upload.tsx` — two-tab screen (paste text / pick file). File picker uses `expo-document-picker` and limits to `text/plain`, `text/markdown`, `application/pdf`, and DOCX MIME types. Uploads via `api.uploadSourceFile()` (multipart) or `api.uploadSourceText()` (JSON).
- `app/library.tsx` — `FlatList` of the user's uploads. Pull-to-refresh + delete confirmation. Backed by `api.listSourceMaterial()` / `api.deleteSourceMaterial()`.
- The home screen now links to both. Counts as the Phase 3 visible thread until Phase 7 wires `/videos/generate`.

## Conventions

- TypeScript strict mode via [packages/config/tsconfig.react-native.json](../../packages/config/tsconfig.react-native.json).
- Public types come from `@brainrot/shared` — never redeclare API contracts locally.
- All API requests go through a single client (to be added in Phase 2) that attaches the access token from `expo-secure-store` and refreshes on 401.
- Public env vars must be prefixed `EXPO_PUBLIC_` — see [.env.example](../../.env.example).
- Design language: Apple Liquid Glass. Concrete components arrive in Phase 9; until then, keep screens unstyled rather than baking in temporary visuals that the design system will overwrite.

## Running

```sh
npm run dev:mobile            # Expo dev server
npm run dev:mobile-only       # Mongo + Expo (no API)
```

The whole stack (Mongo + API + Expo) starts with `npm run dev`.
