/**
 * Custom Adapter Example
 *
 * This example shows how to create a custom adapter for providers
 * not yet supported by Artemis.
 *
 * Usage:
 *   1. Copy this file to your project
 *   2. Modify the CustomAdapter class for your provider
 *   3. Register the adapter before running tests
 */

import type {
  ModelClient,
  AdapterConfig,
  GenerateRequest,
  GenerateResponse,
} from "@artemis/core";
import { adapterRegistry } from "@artemis/core";

/**
 * Custom adapter configuration
 */
interface CustomAdapterConfig extends AdapterConfig {
  provider: "custom";
  apiKey?: string;
  baseURL: string;
  defaultModel?: string;
  customOption?: string;
}

/**
 * Custom adapter for a hypothetical LLM provider
 */
class CustomAdapter implements ModelClient {
  readonly provider = "custom";

  private baseURL: string;
  private apiKey?: string;
  private defaultModel: string;

  constructor(config: CustomAdapterConfig) {
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel || "default-model";
  }

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    const startTime = Date.now();
    const model = request.model || this.defaultModel;

    // Build the prompt from string or messages
    let prompt: string;
    if (typeof request.prompt === "string") {
      prompt = request.prompt;
    } else {
      // Convert messages to a format your provider expects
      prompt = request.prompt
        .map((m: any) => `${m.role}: ${m.content}`)
        .join("\n");
    }

    // Make API request to your provider
    const response = await fetch(`${this.baseURL}/v1/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
      },
      body: JSON.stringify({
        model,
        prompt,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        // Add any provider-specific parameters
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Custom provider error: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as {
      text: string;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    const latencyMs = Date.now() - startTime;

    return {
      text: result.text,
      latencyMs,
      tokens: {
        prompt: result.usage?.prompt_tokens || 0,
        completion: result.usage?.completion_tokens || 0,
        total: result.usage?.total_tokens || 0,
      },
      model,
      provider: this.provider,
    };
  }
}

/**
 * Register the custom adapter
 */
export function registerCustomAdapter(): void {
  adapterRegistry.register("custom", async (config: any) => {
    return new CustomAdapter(config as CustomAdapterConfig);
  });
}

/**
 * Example usage in your test setup:
 *
 * ```typescript
 * import { registerCustomAdapter } from './custom-adapter';
 *
 * // Register before running tests
 * registerCustomAdapter();
 *
 * // Now you can use provider: 'custom' in your scenarios
 * ```
 */

// If running this file directly, register the adapter
if (import.meta.main) {
  registerCustomAdapter();
  console.log("Custom adapter registered successfully");
}
