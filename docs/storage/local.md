# Local Storage

The local storage backend saves run manifests to the filesystem. This is the default storage backend and requires no configuration.

## Configuration

### Default Behavior

By default, ArtemisKit saves manifests to `./artemis-runs` in your project directory:

```
artemis-runs/
├── my-project/
│   ├── ar-20260115-abc123.json
│   ├── ar-20260115-abc123.html
│   ├── ar-20260116-def456.json
│   └── ar-20260116-def456.html
└── another-project/
    └── ...
```

### Custom Path

Override the storage path via config file or environment variable:

**Config file:**
```yaml
# artemis.config.yaml
storage:
  type: local
  basePath: ./my-custom-runs
```

**Environment variable:**
```bash
export ARTEMIS_STORAGE_PATH=./my-custom-runs
```

## File Structure

Each run creates two files:

| File | Description |
|------|-------------|
| `{run_id}.json` | Full run manifest with all results and metadata |
| `{run_id}.html` | Interactive HTML report |

### Manifest Structure

The JSON manifest contains:

```json
{
  "version": "1.0",
  "run_id": "ar-20260115-abc123",
  "project": "my-project",
  "start_time": "2026-01-15T10:00:00Z",
  "end_time": "2026-01-15T10:05:00Z",
  "duration_ms": 300000,
  "config": {
    "scenario": "my-scenario.yaml",
    "provider": "openai",
    "model": "gpt-4o"
  },
  "metrics": {
    "success_rate": 0.95,
    "total_cases": 20,
    "passed_cases": 19,
    "failed_cases": 1,
    "median_latency_ms": 450
  },
  "git": {
    "commit": "abc123",
    "branch": "main",
    "dirty": false
  },
  "cases": [...]
}
```

## CLI Commands

### View History

```bash
# List recent runs
artemiskit history --limit 10

# Filter by project
artemiskit history --project my-project

# Filter by scenario
artemiskit history --scenario auth-tests
```

### Regenerate Reports

```bash
# Regenerate HTML from a saved manifest
artemiskit report artemis-runs/my-project/ar-20260115-abc123.json
```

### Compare Runs

```bash
# Compare two runs
artemiskit compare ar-20260115-abc123 ar-20260116-def456
```

## Programmatic Usage

```typescript
import { LocalStorageAdapter } from '@artemiskit/core';

const storage = new LocalStorageAdapter('./artemis-runs');

// Save a manifest
const path = await storage.save(manifest);

// Load a manifest
const loaded = await storage.load('ar-20260115-abc123');

// List runs
const runs = await storage.list({ 
  project: 'my-project', 
  limit: 10 
});

// Compare runs
const comparison = await storage.compare(
  'ar-20260115-abc123', 
  'ar-20260116-def456'
);

// Delete a run
await storage.delete('ar-20260115-abc123');
```

## Limitations

- **Single machine only** - Files are stored locally and not accessible from other machines
- **No query capabilities** - Filtering is done by scanning files
- **Manual cleanup** - Old runs accumulate unless manually deleted
- **No concurrent access** - Not suitable for parallel CI jobs writing to same location

For team collaboration or CI/CD pipelines, consider using [Supabase storage](./supabase.md).
