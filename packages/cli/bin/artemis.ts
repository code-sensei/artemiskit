#!/usr/bin/env bun
/**
 * Artemis CLI Entry Point
 */

import { createCLI } from '../src/cli';
import { registerAdapters } from '../src/adapters';

// Register adapters before running CLI
await registerAdapters();

const cli = createCLI();
cli.parse(process.argv);
