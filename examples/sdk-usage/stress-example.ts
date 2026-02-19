/**
 * stress-example.ts
 * 
 * Demonstrates how to run load/stress testing programmatically
 * using the ArtemisKit SDK.
 * 
 * Stress testing allows you to:
 *   - Measure throughput (requests per second)
 *   - Track latency percentiles (p50, p90, p95, p99)
 *   - Test system behavior under concurrent load
 *   - Identify performance bottlenecks
 * 
 * Usage:
 *   bun run stress-example.ts
 *   # or
 *   tsx stress-example.ts
 */

import { ArtemisKit } from '@artemiskit/sdk';
import type { StressRequestCompleteEvent } from '@artemiskit/sdk';
import { resolve } from 'path';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function formatLatency(ms: number): string {
  if (ms < 100) return `${colors.green}${ms.toFixed(0)}ms${colors.reset}`;
  if (ms < 500) return `${colors.yellow}${ms.toFixed(0)}ms${colors.reset}`;
  return `${colors.red}${ms.toFixed(0)}ms${colors.reset}`;
}

function formatRPS(rps: number): string {
  if (rps >= 10) return `${colors.green}${rps.toFixed(2)} req/s${colors.reset}`;
  if (rps >= 5) return `${colors.yellow}${rps.toFixed(2)} req/s${colors.reset}`;
  return `${colors.red}${rps.toFixed(2)} req/s${colors.reset}`;
}

async function main() {
  console.log(`${colors.cyan}🏹 ArtemisKit SDK - Stress Testing Example${colors.reset}\n`);

  // Initialize ArtemisKit
  const kit = new ArtemisKit({
    provider: 'openai',
    model: 'gpt-4o-mini',
    project: 'sdk-stress-example',
  });

  // Track live statistics
  let lastUpdate = Date.now();
  const updateInterval = 2000; // Update display every 2 seconds

  // ========================================
  // Register Stress Test Event Handlers
  // ========================================

  kit
    .onStressRequestComplete((event: StressRequestCompleteEvent) => {
      // Periodic live update
      const now = Date.now();
      if (now - lastUpdate > updateInterval) {
        lastUpdate = now;
        const status = event.result.success ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
        const latency = formatLatency(event.result.latencyMs);
        const rps = formatRPS(event.currentRPS);
        
        console.log(
          `${colors.dim}[${event.index + 1}]${colors.reset} ` +
          `${status} Latency: ${latency} | RPS: ${rps}`
        );
      }
    })
    .onProgress((event) => {
      if (event.phase === 'setup') {
        console.log(`${colors.yellow}[setup]${colors.reset} ${event.message}`);
      } else if (event.phase === 'teardown') {
        console.log(`\n${colors.yellow}[complete]${colors.reset} ${event.message}`);
      }
    });

  // Path to scenario
  const scenarioPath = resolve(__dirname, 'scenarios/example.yaml');

  console.log(`${colors.dim}Scenario: ${scenarioPath}${colors.reset}`);
  console.log(`${colors.dim}Configuration: 10 concurrent workers, 30s duration, 5s ramp-up${colors.reset}\n`);

  try {
    console.log(`${colors.cyan}Starting stress test...${colors.reset}\n`);
    const startTime = Date.now();

    // Run stress testing
    const result = await kit.stress({
      scenario: scenarioPath,
      concurrency: 10,        // 10 concurrent workers
      duration: 30,           // Run for 30 seconds
      rampUp: 5,              // 5 second ramp-up period
      // maxRequests: 100,    // Optional: limit total requests
    });

    const totalDuration = Date.now() - startTime;
    const metrics = result.manifest.metrics;

    // Output detailed results
    console.log(`\n${colors.cyan}📊 Stress Test Results${colors.reset}`);
    console.log('═'.repeat(60));

    // Overall status
    console.log(`\n${colors.bold}Overview${colors.reset}`);
    console.log('─'.repeat(40));
    console.log(`Status:          ${result.success ? `${colors.green}PASSED ✅${colors.reset}` : `${colors.red}FAILED ❌${colors.reset}`}`);
    console.log(`Duration:        ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`Total Requests:  ${metrics.total_requests}`);
    console.log(`Success Rate:    ${(result.successRate * 100).toFixed(1)}%`);

    // Throughput
    console.log(`\n${colors.bold}Throughput${colors.reset}`);
    console.log('─'.repeat(40));
    console.log(`Requests/Second: ${formatRPS(result.rps)}`);
    console.log(`Successful:      ${colors.green}${metrics.successful_requests}${colors.reset}`);
    console.log(`Failed:          ${metrics.failed_requests > 0 ? colors.red : ''}${metrics.failed_requests}${colors.reset}`);

    // Latency metrics
    console.log(`\n${colors.bold}Latency Metrics${colors.reset}`);
    console.log('─'.repeat(40));
    console.log(`Min:    ${formatLatency(metrics.min_latency_ms)}`);
    console.log(`Avg:    ${formatLatency(metrics.avg_latency_ms)}`);
    console.log(`p50:    ${formatLatency(metrics.p50_latency_ms)}`);
    console.log(`p90:    ${formatLatency(metrics.p90_latency_ms)}`);
    console.log(`p95:    ${formatLatency(result.p95LatencyMs)}`);
    console.log(`p99:    ${formatLatency(metrics.p99_latency_ms)}`);
    console.log(`Max:    ${formatLatency(metrics.max_latency_ms)}`);

    // Token metrics (if available)
    if (metrics.tokens) {
      console.log(`\n${colors.bold}Token Usage${colors.reset}`);
      console.log('─'.repeat(40));
      console.log(`Total Tokens:      ${metrics.tokens.total_tokens}`);
      console.log(`Prompt Tokens:     ${metrics.tokens.total_prompt_tokens}`);
      console.log(`Completion Tokens: ${metrics.tokens.total_completion_tokens}`);
      console.log(`Avg/Request:       ${metrics.tokens.avg_tokens_per_request.toFixed(0)}`);
    }

    // Latency histogram (ASCII art)
    console.log(`\n${colors.bold}Latency Distribution${colors.reset}`);
    console.log('─'.repeat(40));
    const buckets = [100, 200, 500, 1000, 2000, 5000];
    const sampleResults = result.manifest.sample_results || [];
    const successfulLatencies = sampleResults.filter(r => r.success).map(r => r.latencyMs);
    
    for (let i = 0; i < buckets.length; i++) {
      const lower = i === 0 ? 0 : buckets[i - 1];
      const upper = buckets[i];
      const count = successfulLatencies.filter(l => l >= lower && l < upper).length;
      const percentage = successfulLatencies.length > 0 ? (count / successfulLatencies.length) * 100 : 0;
      const bar = '█'.repeat(Math.round(percentage / 2));
      console.log(`${String(lower).padStart(5)}-${String(upper).padStart(5)}ms: ${bar} ${percentage.toFixed(1)}%`);
    }
    const overMax = successfulLatencies.filter(l => l >= buckets[buckets.length - 1]).length;
    const overPercentage = successfulLatencies.length > 0 ? (overMax / successfulLatencies.length) * 100 : 0;
    console.log(`${String(buckets[buckets.length - 1]).padStart(5)}ms+:     ${'█'.repeat(Math.round(overPercentage / 2))} ${overPercentage.toFixed(1)}%`);

    // Recommendations
    console.log(`\n${colors.bold}📋 Analysis${colors.reset}`);
    console.log('─'.repeat(40));
    
    if (result.success) {
      console.log(`${colors.green}✓${colors.reset} Success rate meets the 95% threshold.`);
    } else {
      console.log(`${colors.red}✗${colors.reset} Success rate below 95% threshold - investigate failures.`);
    }

    if (result.p95LatencyMs < 1000) {
      console.log(`${colors.green}✓${colors.reset} p95 latency is excellent (< 1s).`);
    } else if (result.p95LatencyMs < 3000) {
      console.log(`${colors.yellow}!${colors.reset} p95 latency is acceptable but could be improved.`);
    } else {
      console.log(`${colors.red}✗${colors.reset} p95 latency is high (> 3s) - consider optimizations.`);
    }

    if (result.rps >= 10) {
      console.log(`${colors.green}✓${colors.reset} Throughput is good for production workloads.`);
    } else if (result.rps >= 5) {
      console.log(`${colors.yellow}!${colors.reset} Throughput is moderate - scale concurrency if needed.`);
    } else {
      console.log(`${colors.red}✗${colors.reset} Low throughput - check rate limits or bottlenecks.`);
    }

    process.exit(result.success ? 0 : 1);

  } catch (error) {
    console.error(`\n${colors.red}❌ Error:${colors.reset}`, error);
    process.exit(1);
  }
}

// Run the example
main();
