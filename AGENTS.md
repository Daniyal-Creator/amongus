# Repository Guidelines

## Project Structure & Module Organization
This repository currently centers on the Next.js frontend in `frontend/`. App Router pages live in `frontend/src/app/`, shared UI lives in `frontend/src/components/`, reusable data helpers live in `frontend/src/lib/`, and shared types live in `frontend/src/types/`. Static assets belong in `frontend/public/`. Product and architecture notes are kept in `docs/` and `task.md`. `backend/` exists as a placeholder for the planned Fastify/PostgreSQL/Redis service but does not contain implementation yet.

## Build, Test, and Development Commands
Run all app commands from `frontend/`:

- `npm run dev` starts the local Next.js server on `http://localhost:3000`.
- `npm run build` creates the production build.
- `npm run start` serves the production build locally.
- `npm run lint` runs ESLint with the Next.js core-web-vitals and TypeScript rules.

There is no top-level workspace script yet, so use the `frontend/` package directly.

## Coding Style & Naming Conventions
Use TypeScript and App Router conventions. Follow the existing style: 2-space indentation, double quotes, and semicolons. Name React components in PascalCase (`LobbyRoomClient.tsx`), route folders in lowercase (`src/app/leaderboard`), and utility files in kebab or descriptive lowercase (`mock-data.ts`). Prefer server components by default and add client components only where interactivity is required.

## Testing Guidelines
An automated test suite is not configured yet. Until one is added, treat `npm run lint` and a successful production build as the minimum quality gate. When adding tests, place them next to the feature or under `frontend/src/__tests__/`, and use names like `ComponentName.test.tsx` or `route-name.test.ts`.

## Commit & Pull Request Guidelines
The visible Git history currently contains only the scaffold commit (`Initial commit from Create Next App`). Keep future commits short, imperative, and scoped, for example `feat(frontend): add lobby room state`. PRs should include a brief summary, affected paths, screenshots or recordings for UI changes, linked tasks/issues, and clear notes when mock data or unfinished backend integrations remain.

## Configuration & Collaboration Notes
Do not commit secrets, `.env*` files, or build output such as `frontend/.next/`. If you introduce backend code, document new environment variables in `docs/` and replace frontend mock data incrementally rather than mixing mock and live state in the same feature without explanation.
