# UltrON Monorepo

Unified repository for the UltrON IoT Industrial Telemetry Platform.

## Monorepo Layout
- `client/`: Existing app containing FastAPI backend, React operator UI, and GitHub updater/installer configurations.
- `admin/`: Admin platform React UI for provisioning configurations, managing logins, commands, and software releases.
- `supabase/`: Database models, migrations, and Deno Edge Functions.
- `common/`: Common TypeScript models and constants shared between components.
- `docs/`: Product planning, design papers, and prompts history.\n