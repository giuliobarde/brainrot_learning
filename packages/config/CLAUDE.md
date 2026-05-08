# CLAUDE.md — packages/config

Shared ESLint, Prettier, and TypeScript configurations. No runtime code.

## Files

- `eslint.base.cjs` — base rules (TypeScript, import ordering, eqeqeq, etc.).
- `eslint.node.cjs` — extends base; adds Node env. Used by `apps/api` and `packages/shared`.
- `eslint.react-native.cjs` — extends base; adds React + RN. Used by `apps/mobile`.
- `tsconfig.base.json` — strict TS settings (target ES2022, `noUncheckedIndexedAccess`, isolatedModules).
- `tsconfig.node.json` — extends base, configures CommonJS module + `node` types.
- `tsconfig.react-native.json` — extends base for the mobile workspace.

## Conventions

- Per-workspace `tsconfig.json` and `.eslintrc.cjs` should **extend** these — do not redefine rules locally unless the workspace genuinely diverges.
- Loosening a rule in a workspace is a smell; prefer fixing the underlying code or, if the rule is wrong project-wide, change it here once.
