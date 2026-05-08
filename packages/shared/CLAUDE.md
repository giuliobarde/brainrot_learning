# CLAUDE.md — packages/shared

TypeScript types shared between the backend (`apps/api`) and the mobile app (`apps/mobile`). This package has **no runtime code** — it is pure types compiled to declaration files plus a thin JS module.

## Scope

- API request and response shapes (auth, video generation, listings).
- Domain entities as the **public** surface — what clients see, not what Mongoose stores. (Example: `User` here has no `passwordHash`.)
- Enums and string-literal unions that both apps must agree on (`VideoStatus`, `SourceMaterialKind`, …).

## Don'ts

- **Don't import any runtime dependency here.** No Mongoose, no Express. Types only.
- **Don't mirror Mongoose schemas verbatim.** Server-only fields (hashed credentials, internal flags) stay inside the API workspace.
- **Don't re-export from the API.** The dependency direction is `apps/* → packages/shared`, never the reverse.

## Adding a type

1. Add the file under [src/types/](src/types/) (one file per logical group).
2. Re-export from [src/index.ts](src/index.ts).
3. Run `npm --workspace @brainrot/shared run build` so consumers see the new declaration.

## Build

`npm --workspace @brainrot/shared run build` emits to `dist/`. The API resolves this package via the workspace `"main": "./dist/index.js"`, so a stale `dist/` will silently break consumers — rebuild after type changes.
