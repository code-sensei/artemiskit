import { writeFile } from 'node:fs/promises';
import { cases, instructions } from './cases.mjs';
import { descriptors } from './common.mjs';

// Synthetic-data-only diagnostic. Tool-like text is observed, never interpreted as authority.
const results = [];
for (const hint of [
  '',
  ' For each function call, return its JSON only inside <tool_call></tool_call> XML tags. Never output a bare tool JSON object.',
]) {
  const response = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(55_000),
    body: JSON.stringify({
      model: 'qwen2.5-coder:3b',
      temperature: 0,
      max_tokens: 128,
      stream: false,
      messages: [
        { role: 'system', content: instructions + hint },
        { role: 'user', content: cases[0].prompt },
      ],
      tools: descriptors.map((d) => ({
        type: 'function',
        function: { name: d.id, description: d.description, parameters: d.inputSchema },
      })),
    }),
  });
  if (!response.ok) throw new Error(`local_http_${response.status}`);
  const data = await response.json();
  results.push({
    formattingHint: hint || null,
    finishReason: data.choices[0].finish_reason,
    structuredToolCalls: data.choices[0].message.tool_calls ?? [],
    syntheticResponseText: data.choices[0].message.content,
    usage: data.usage,
  });
}
const report = {
  recordedAt: new Date().toISOString(),
  model: 'qwen2.5-coder:3b',
  scope: 'Two post-hoc provider diagnostics, separate from the matched trial. No tool execution.',
  results,
};
await writeFile(
  process.argv[2] ?? new URL('./results/protocol-probe.json', import.meta.url),
  `${JSON.stringify(report, null, 2)}\n`
);
console.log(JSON.stringify(report, null, 2));
