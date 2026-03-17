/**
 * mode-normalization.ts
 *
 * Demonstrates Guardian mode normalization in v0.3.2.
 *
 * The Guardian system now uses canonical mode names with
 * backwards-compatible support for legacy names:
 *
 * Canonical Modes (v0.3.2+):
 *   - 'observe'    - Log only, never block
 *   - 'selective'  - Block high-confidence threats only
 *   - 'strict'     - Block all detected threats
 *
 * Legacy Modes (deprecated, emit warnings):
 *   - 'testing'    → maps to 'observe'
 *   - 'hybrid'     → maps to 'selective'
 *   - 'guardian'   → maps to 'strict'
 *
 * @since v0.3.2
 *
 * Usage:
 *   bun run examples/05-sdk/guardian/mode-normalization.ts
 */

import {
  createGuardian,
  normalizeGuardianMode,
  type GuardianModeCanonical,
  type GuardianModeLegacy,
  type GuardianModeAll,
  type GuardianConfig,
} from '@artemiskit/sdk';

async function main() {
  console.log('🛡️ ArtemisKit Guardian - Mode Normalization (v0.3.2)\n');

  // ========================================
  // Example 1: Using normalizeGuardianMode function
  // ========================================
  console.log('─'.repeat(60));
  console.log('Example 1: normalizeGuardianMode() function');
  console.log('─'.repeat(60));

  // Capture deprecation warnings
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (msg: string) => {
    warnings.push(msg);
    originalWarn(msg);
  };

  // Legacy mode normalization (will emit warnings)
  console.log('\nLegacy mode mappings:');

  const testingMode = normalizeGuardianMode('testing');
  console.log(`  'testing'  → '${testingMode}'`);

  const guardianMode = normalizeGuardianMode('guardian');
  console.log(`  'guardian' → '${guardianMode}'`);

  const hybridMode = normalizeGuardianMode('hybrid');
  console.log(`  'hybrid'   → '${hybridMode}'`);

  // Canonical modes pass through unchanged (no warnings)
  console.log('\nCanonical modes (no warnings):');

  const observeMode = normalizeGuardianMode('observe');
  console.log(`  'observe'   → '${observeMode}'`);

  const selectiveMode = normalizeGuardianMode('selective');
  console.log(`  'selective' → '${selectiveMode}'`);

  const strictMode = normalizeGuardianMode('strict');
  console.log(`  'strict'    → '${strictMode}'`);

  console.warn = originalWarn;

  console.log(`\nDeprecation warnings emitted: ${warnings.length}`);

  // ========================================
  // Example 2: Creating Guardian with canonical modes
  // ========================================
  console.log('\n' + '─'.repeat(60));
  console.log('Example 2: Creating Guardian with Canonical Modes');
  console.log('─'.repeat(60));

  // Observe mode: Log violations but never block
  const observeGuardian = createGuardian({
    mode: 'observe', // Canonical name
    validateInput: true,
    validateOutput: true,
    blockOnFailure: false, // Observe mode never blocks
    enableLogging: true,
  });
  console.log('\nObserve mode Guardian created:');
  console.log('  - Logs all violations');
  console.log('  - Never blocks requests');
  console.log('  - Useful for testing and monitoring');

  // Selective mode: Block only high-confidence threats
  const selectiveGuardian = createGuardian({
    mode: 'selective',
    validateInput: true,
    validateOutput: true,
    blockOnFailure: true,
    // Configure content validation for selective blocking
    contentValidation: {
      strategy: 'semantic',
      semanticThreshold: 0.9, // High threshold for blocking
      categories: ['prompt_injection', 'jailbreak'],
    },
  });
  console.log('\nSelective mode Guardian created:');
  console.log('  - Blocks high-confidence threats');
  console.log('  - Uses semantic validation with high threshold');
  console.log('  - Balanced security and usability');

  // Strict mode: Block all detected threats
  const strictGuardian = createGuardian({
    mode: 'strict',
    validateInput: true,
    validateOutput: true,
    blockOnFailure: true,
    contentValidation: {
      strategy: 'hybrid', // Use both semantic and pattern
      semanticThreshold: 0.7, // Lower threshold for more blocking
      categories: ['prompt_injection', 'jailbreak', 'pii_disclosure'],
      patterns: {
        enabled: true,
        caseInsensitive: true,
      },
    },
  });
  console.log('\nStrict mode Guardian created:');
  console.log('  - Blocks all detected threats');
  console.log('  - Uses hybrid validation (semantic + pattern)');
  console.log('  - Maximum security, may have higher false positive rate');

  // ========================================
  // Example 3: Mode behavior comparison
  // ========================================
  console.log('\n' + '─'.repeat(60));
  console.log('Example 3: Mode Behavior Comparison');
  console.log('─'.repeat(60));

  const modeBehaviors: Record<
    GuardianModeCanonical,
    {
      inputValidation: string;
      outputValidation: string;
      blocking: string;
      useCase: string;
    }
  > = {
    observe: {
      inputValidation: 'Log only',
      outputValidation: 'Log only',
      blocking: 'Never',
      useCase: 'Development, testing, monitoring',
    },
    selective: {
      inputValidation: 'Block high-confidence',
      outputValidation: 'Block high-confidence',
      blocking: 'Threshold-based',
      useCase: 'Production with balanced security',
    },
    strict: {
      inputValidation: 'Block all detected',
      outputValidation: 'Block all detected',
      blocking: 'Always on detection',
      useCase: 'High-security environments',
    },
  };

  console.log('\nMode comparison table:');
  console.log('┌──────────────┬────────────────────┬────────────────────┬────────────────────┐');
  console.log('│ Mode         │ Input Validation   │ Output Validation  │ Blocking           │');
  console.log('├──────────────┼────────────────────┼────────────────────┼────────────────────┤');

  for (const [mode, behavior] of Object.entries(modeBehaviors)) {
    console.log(
      `│ ${mode.padEnd(12)} │ ${behavior.inputValidation.padEnd(18)} │ ${behavior.outputValidation.padEnd(18)} │ ${behavior.blocking.padEnd(18)} │`
    );
  }
  console.log('└──────────────┴────────────────────┴────────────────────┴────────────────────┘');

  // ========================================
  // Example 4: Migration from legacy modes
  // ========================================
  console.log('\n' + '─'.repeat(60));
  console.log('Example 4: Migration from Legacy Modes');
  console.log('─'.repeat(60));

  console.log(`
Migration guide for legacy mode users:

Before (deprecated):
  const guardian = createGuardian({ mode: 'testing' });
  const guardian = createGuardian({ mode: 'guardian' });
  const guardian = createGuardian({ mode: 'hybrid' });

After (v0.3.2+):
  const guardian = createGuardian({ mode: 'observe' });    // was 'testing'
  const guardian = createGuardian({ mode: 'strict' });     // was 'guardian'
  const guardian = createGuardian({ mode: 'selective' });  // was 'hybrid'

Legacy modes still work but emit deprecation warnings.
Update your code to use canonical names for future compatibility.
`);

  // ========================================
  // Example 5: Type-safe mode selection
  // ========================================
  console.log('─'.repeat(60));
  console.log('Example 5: Type-Safe Mode Selection');
  console.log('─'.repeat(60));

  // Function that accepts only canonical modes (recommended)
  function createProductionGuardian(
    mode: GuardianModeCanonical
  ): ReturnType<typeof createGuardian> {
    return createGuardian({
      mode,
      validateInput: true,
      validateOutput: true,
      blockOnFailure: mode !== 'observe',
    });
  }

  // Function that accepts all modes (for migration)
  function createMigrationGuardian(mode: GuardianModeAll): ReturnType<typeof createGuardian> {
    const normalizedMode = normalizeGuardianMode(mode);
    return createGuardian({
      mode: normalizedMode,
      validateInput: true,
      validateOutput: true,
      blockOnFailure: normalizedMode !== 'observe',
    });
  }

  console.log('\nType-safe functions created:');
  console.log('  - createProductionGuardian(mode: GuardianModeCanonical)');
  console.log('    Accepts only: "observe" | "selective" | "strict"');
  console.log('');
  console.log('  - createMigrationGuardian(mode: GuardianModeAll)');
  console.log('    Accepts both canonical and legacy modes');
  console.log('    Normalizes legacy to canonical internally');

  console.log('\n' + '─'.repeat(60));
  console.log('✅ Mode normalization examples completed');
  console.log('─'.repeat(60));
}

main().catch(console.error);
