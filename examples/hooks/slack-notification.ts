/**
 * Slack Notification Hook
 *
 * Sends a Slack notification when Artemis tests complete.
 *
 * Usage:
 *   SLACK_WEBHOOK_URL=https://hooks.slack.com/... bun run hooks/slack-notification.ts
 *
 * This can be called as a post-run hook in your CI/CD pipeline.
 */

// Make this file a proper ES module
export {};

interface RunResult {
  run_id: string;
  project: string;
  metrics: {
    success_rate: number;
    total_cases: number;
    passed_cases: number;
    failed_cases: number;
    median_latency_ms: number;
  };
  created_at: string;
}

async function sendSlackNotification(result: RunResult): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error("SLACK_WEBHOOK_URL environment variable not set");
    process.exit(1);
  }

  const successRate = (result.metrics.success_rate * 100).toFixed(1);
  const passed = result.metrics.passed_cases;
  const failed = result.metrics.failed_cases;
  const total = result.metrics.total_cases;

  // Determine color based on success rate
  let color = "#36a64f"; // green
  let emoji = ":white_check_mark:";

  if (result.metrics.success_rate < 1) {
    color = "#ff9800"; // orange
    emoji = ":warning:";
  }

  if (result.metrics.success_rate < 0.8) {
    color = "#dc3545"; // red
    emoji = ":x:";
  }

  const message = {
    attachments: [
      {
        color,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `${emoji} Artemis Test Results`,
              emoji: true,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Project:*\n${result.project}`,
              },
              {
                type: "mrkdwn",
                text: `*Run ID:*\n\`${result.run_id}\``,
              },
              {
                type: "mrkdwn",
                text: `*Success Rate:*\n${successRate}%`,
              },
              {
                type: "mrkdwn",
                text: `*Results:*\n${passed}/${total} passed`,
              },
            ],
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Passed:* ${passed}`,
              },
              {
                type: "mrkdwn",
                text: `*Failed:* ${failed}`,
              },
              {
                type: "mrkdwn",
                text: `*Median Latency:* ${result.metrics.median_latency_ms}ms`,
              },
              {
                type: "mrkdwn",
                text: `*Time:* ${new Date(result.created_at).toLocaleString()}`,
              },
            ],
          },
        ],
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    throw new Error(`Slack notification failed: ${response.status}`);
  }

  console.log("Slack notification sent successfully");
}

// Read run result from stdin or file
async function main(): Promise<void> {
  const inputFile = process.argv[2];

  let result: RunResult;

  if (inputFile) {
    const content = await Bun.file(inputFile).text();
    result = JSON.parse(content);
  } else {
    // Read from stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks).toString("utf-8");
    result = JSON.parse(content);
  }

  await sendSlackNotification(result);
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
