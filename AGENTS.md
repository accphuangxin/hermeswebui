# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What is Hermes Web

Hermes Web is a Tauri 2 desktop app (React + Rust) that manages configurations for multiple AI CLI tools (Codex, Codex, Gemini CLI, OpenCode, OpenClaw, Hermes Agent). It provides a visual interface for switching API providers, managing MCP servers, prompts, skills, and includes a local proxy with failover.

## Development Commands

```bash
# Install dependencies
pnpm install


# Dev mode with hot reload (launches both Vite frontend and Tauri backend)
pnpm dev

# Frontend only (no Tauri window)
pnpm dev:renderer

# Type check
pnpm typecheck

# Format
pnpm format
pnpm format:check

# Frontend tests
pnpm test:unit
pnpm test:unit:watch

# Build production app
pnpm build
pnpm tauri build --debug
```

### Rust Backend

```bash
cd src-tauri
cargo fmt
cargo clippy
cargo test
cargo test test_name              # run specific test
cargo test --features test-hooks  # enable test-hooks feature flag
```

### Full CI check before submitting

```bash
pnpm typecheck && pnpm format:check && pnpm test:unit
cd src-tauri && cargo fmt --check && cargo clippy && cargo test
```

## Architecture

**Tauri 2 IPC boundary** separates the app into two halves:

- **Frontend** (`src/`): React 18 + TypeScript + Vite + TailwindCSS 3.4 + shadcn/ui
- **Backend** (`src-tauri/src/`): Rust with Tauri 2.8, SQLite (rusqlite), tokio, axum (proxy)

### Backend layering (Commands → Services → Database)

- `src-tauri/src/commands/` — Tauri IPC command handlers (one file per domain). Command names must be **camelCase**.
- `src-tauri/src/services/` — Business logic. Key services: `ProviderService`, `McpService`, `ProxyService`, `SkillService`, `PromptService`, `ConfigService`, `SpeedtestService`.
- `src-tauri/src/database/` — SQLite DAO layer with migrations. DB lives at `~/.cc-switch/cc-switch.db`.
- `src-tauri/src/proxy/` — Local HTTP proxy (axum-based) with failover, circuit breaker, format conversion, SSE streaming, model mapping.

### Frontend layering (Components → Hooks → API → Query)

- `src/components/` — UI organized by domain (providers, mcp, proxy, skills, sessions, etc.) + `ui/` for shadcn primitives.
- `src/hooks/` — Business logic hooks that compose API calls and state.
- `src/lib/api/` — Type-safe wrappers around Tauri `invoke()` calls.
- `src/lib/query/` — TanStack Query v5 configuration (queries, mutations, query client).
- `src/lib/schemas/` — Zod validation schemas for forms.

### Data flow

All persistent data is stored in SQLite (single source of truth). The backend writes to CLI tool config files (JSON/TOML/.env) on provider switch. Frontend uses TanStack Query for cache/sync with backend state via Tauri IPC.

## Key Conventions

- **i18n**: Three locale files at `src/i18n/locales/{en,zh,ja}.json`. All user-facing strings must use `t()` from react-i18next. Update all three when changing text.
- **Commits**: Conventional Commits format (`feat(scope):`, `fix(scope):`, `docs:`, `chore:`, etc.)
- **Atomic writes**: Backend uses temp-file + rename pattern to avoid config corruption.
- **Concurrency**: Mutex-protected DB connection; proxy uses tokio async.
- **Feature flag**: `test-hooks` cargo feature enables test-only code paths in the backend.

## Environment Requirements

- Node.js 22+ (`.node-version`: 22.12.0)
- pnpm 8+
- Rust 1.95+ (`rust-toolchain.toml`)
- Tauri CLI 2.8+ (`@tauri-apps/cli`)

## Testing

- **Frontend**: vitest + jsdom + MSW (mock Tauri IPC) + @testing-library/react. Tests in `tests/`.
- **Backend**: `cargo test` with `serial_test` for DB-dependent tests. Integration tests in `src-tauri/tests/`.
- Path alias: `@/` maps to `src/` in both Vite and vitest configs.
