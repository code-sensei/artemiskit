#!/usr/bin/env bun
/**
 * Artemis CLI Entry Point
 */

import { registerAdapters } from '../src/adapters';
import { createCLI } from '../src/cli';

// Register adapters before running CLI
await registerAdapters();

const cli = createCLI();
cli.parse(process.argv);
