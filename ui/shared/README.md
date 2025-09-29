# Shared Types

This directory contains TypeScript type definitions shared between the backend and frontend.

## Important Notes

1. **Generated Files**: During build, TypeScript may generate `.js`, `.d.ts`, and `.map` files here. These are ignored by Git and not included in Docker images.

2. **Type Sync**: The types in `backend/src/types/hospital.ts` are **manually duplicated** from this directory to avoid cross-directory compilation issues in Docker builds.

3. **When Updating Types**: If you modify `shared/types/hospital.ts`, you **must** also update `backend/src/types/hospital.ts` to keep them in sync.

## Why Duplication?

TypeScript's `rootDir` restriction prevents compiling files outside the source directory in Docker builds. Rather than fighting this with complex build configurations, we accept the duplication with clear documentation.

## Files

- `types/hospital.ts` - API contract types used by frontend
- Backend uses a copy at `backend/src/types/hospital.ts`
