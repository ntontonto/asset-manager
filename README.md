# asset-manager

Unified portfolio management system for crypto and traditional assets.

## Getting Started

```bash
# install dev dependencies
npm install

# run lint (with layer boundaries)
npm run lint

# auto-fix lint issues where possible
npm run lint:fix

# format with Prettier
npm run format
# or check only
npm run format:check
```

## Architecture Overview

See `docs/SystemModuleStrategy.md` for the layered module plan. Folders are expected under `src/` to match those layers (e.g., `src/ingestion`, `src/storage`, `src/analytics`, etc.), and ESLint enforces allowed import directions between them.
