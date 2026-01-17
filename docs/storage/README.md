# Storage Documentation

ArtemisKit supports multiple storage backends for persisting run manifests, metrics, and history.

## Available Storage Backends

| Backend | Description | Documentation |
|---------|-------------|---------------|
| `local` | Local filesystem storage (default) | [local.md](./local.md) |
| `supabase` | Cloud storage with PostgreSQL | [supabase.md](./supabase.md) |

## Quick Comparison

| Feature | Local | Supabase |
|---------|-------|----------|
| Setup complexity | None | Moderate |
| Persistence | Filesystem | Cloud |
| Multi-machine access | No | Yes |
| Query capabilities | Limited | Full SQL |
| Team collaboration | No | Yes |
| Cost | Free | Free tier available |

## Choosing a Backend

- **Local** - Best for local development, single-machine usage, and getting started quickly
- **Supabase** - Best for team collaboration, CI/CD pipelines, and production usage

## Storage Priority

ArtemisKit resolves the storage backend in this order:

1. CLI flag or programmatic configuration
2. Config file (`artemis.config.yaml`)
3. Environment variables (`SUPABASE_URL` + `SUPABASE_ANON_KEY`)
4. Default: `local` with `./artemis-runs` path

## Configuration

### Config File

```yaml
# artemis.config.yaml
storage:
  type: local  # or 'supabase'
  basePath: ./artemis-runs  # for local
  
  # For Supabase:
  # type: supabase
  # url: ${SUPABASE_URL}
  # anonKey: ${SUPABASE_ANON_KEY}
  # bucket: artemis-runs
```

### Environment Variables

```bash
# For Supabase storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_BUCKET=artemis-runs  # optional, defaults to 'artemis-runs'

# For local storage path override
ARTEMIS_STORAGE_PATH=./my-custom-path
```
