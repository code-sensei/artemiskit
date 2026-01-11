#!/usr/bin/env bun
/**
 * Artemis CLI Entry Point
 */

import { createCLI } from '../src/cli';

const cli = createCLI();
cli.parse(process.argv);
