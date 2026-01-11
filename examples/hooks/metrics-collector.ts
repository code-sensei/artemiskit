/**
 * Metrics Collector Hook
 *
 * Collects Artemis test metrics and sends them to a metrics backend.
 * Supports Prometheus pushgateway, Datadog, and custom endpoints.
 *
 * Usage:
 *   METRICS_BACKEND=prometheus PUSHGATEWAY_URL=http://localhost:9091 bun run hooks/metrics-collector.ts result.json
 */

interface RunMetrics {
  run_id: string;
  project: string;
  metrics: {
    success_rate: number;
    total_cases: number;
    passed_cases: number;
    failed_cases: number;
    median_latency_ms: number;
    total_tokens: number;
  };
  created_at: string;
}

type MetricsBackend = 'prometheus' | 'datadog' | 'custom';

async function pushToPrometheus(metrics: RunMetrics): Promise<void> {
  const pushgatewayUrl = process.env.PUSHGATEWAY_URL || 'http://localhost:9091';
  const job = 'artemis';
  const instance = metrics.project.replace(/[^a-zA-Z0-9_]/g, '_');

  // Format metrics in Prometheus exposition format
  const promMetrics = `
# HELP artemis_success_rate Test success rate
# TYPE artemis_success_rate gauge
artemis_success_rate{project="${metrics.project}",run_id="${metrics.run_id}"} ${metrics.metrics.success_rate}

# HELP artemis_total_cases Total number of test cases
# TYPE artemis_total_cases gauge
artemis_total_cases{project="${metrics.project}",run_id="${metrics.run_id}"} ${metrics.metrics.total_cases}

# HELP artemis_passed_cases Number of passed test cases
# TYPE artemis_passed_cases gauge
artemis_passed_cases{project="${metrics.project}",run_id="${metrics.run_id}"} ${metrics.metrics.passed_cases}

# HELP artemis_failed_cases Number of failed test cases
# TYPE artemis_failed_cases gauge
artemis_failed_cases{project="${metrics.project}",run_id="${metrics.run_id}"} ${metrics.metrics.failed_cases}

# HELP artemis_median_latency_ms Median response latency in milliseconds
# TYPE artemis_median_latency_ms gauge
artemis_median_latency_ms{project="${metrics.project}",run_id="${metrics.run_id}"} ${metrics.metrics.median_latency_ms}

# HELP artemis_total_tokens Total tokens used
# TYPE artemis_total_tokens counter
artemis_total_tokens{project="${metrics.project}",run_id="${metrics.run_id}"} ${metrics.metrics.total_tokens}
`.trim();

  const url = `${pushgatewayUrl}/metrics/job/${job}/instance/${instance}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: promMetrics,
  });

  if (!response.ok) {
    throw new Error(`Prometheus push failed: ${response.status}`);
  }

  console.log(`Metrics pushed to Prometheus pushgateway: ${url}`);
}

async function pushToDatadog(metrics: RunMetrics): Promise<void> {
  const apiKey = process.env.DATADOG_API_KEY;
  const site = process.env.DATADOG_SITE || 'datadoghq.com';

  if (!apiKey) {
    throw new Error('DATADOG_API_KEY environment variable not set');
  }

  const timestamp = Math.floor(new Date(metrics.created_at).getTime() / 1000);
  const tags = [
    `project:${metrics.project}`,
    `run_id:${metrics.run_id}`,
  ];

  const series = [
    {
      metric: 'artemis.success_rate',
      points: [[timestamp, metrics.metrics.success_rate]],
      type: 'gauge',
      tags,
    },
    {
      metric: 'artemis.total_cases',
      points: [[timestamp, metrics.metrics.total_cases]],
      type: 'gauge',
      tags,
    },
    {
      metric: 'artemis.passed_cases',
      points: [[timestamp, metrics.metrics.passed_cases]],
      type: 'gauge',
      tags,
    },
    {
      metric: 'artemis.failed_cases',
      points: [[timestamp, metrics.metrics.failed_cases]],
      type: 'gauge',
      tags,
    },
    {
      metric: 'artemis.median_latency_ms',
      points: [[timestamp, metrics.metrics.median_latency_ms]],
      type: 'gauge',
      tags,
    },
    {
      metric: 'artemis.total_tokens',
      points: [[timestamp, metrics.metrics.total_tokens]],
      type: 'count',
      tags,
    },
  ];

  const response = await fetch(`https://api.${site}/api/v1/series`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': apiKey,
    },
    body: JSON.stringify({ series }),
  });

  if (!response.ok) {
    throw new Error(`Datadog push failed: ${response.status}`);
  }

  console.log('Metrics pushed to Datadog');
}

async function pushToCustomEndpoint(metrics: RunMetrics): Promise<void> {
  const endpointUrl = process.env.METRICS_ENDPOINT_URL;
  const apiKey = process.env.METRICS_API_KEY;

  if (!endpointUrl) {
    throw new Error('METRICS_ENDPOINT_URL environment variable not set');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      source: 'artemis',
      timestamp: metrics.created_at,
      project: metrics.project,
      run_id: metrics.run_id,
      metrics: metrics.metrics,
    }),
  });

  if (!response.ok) {
    throw new Error(`Custom endpoint push failed: ${response.status}`);
  }

  console.log(`Metrics pushed to custom endpoint: ${endpointUrl}`);
}

async function main(): Promise<void> {
  const inputFile = process.argv[2];
  const backend = (process.env.METRICS_BACKEND || 'prometheus') as MetricsBackend;

  if (!inputFile) {
    console.error('Usage: bun run metrics-collector.ts <result.json>');
    process.exit(1);
  }

  const content = await Bun.file(inputFile).text();
  const metrics: RunMetrics = JSON.parse(content);

  console.log(`Pushing metrics for run ${metrics.run_id} to ${backend}...`);

  switch (backend) {
    case 'prometheus':
      await pushToPrometheus(metrics);
      break;
    case 'datadog':
      await pushToDatadog(metrics);
      break;
    case 'custom':
      await pushToCustomEndpoint(metrics);
      break;
    default:
      throw new Error(`Unknown metrics backend: ${backend}`);
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
