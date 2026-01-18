---
"@artemiskit/cli": patch
---

Enhanced CLI user experience and added integration tests

- Fixed table border alignment in compare and history commands (ANSI color codes no longer affect column widths)
- Added progress bars, error display panels, and summary boxes
- Added box-drawing tables with Unicode characters for compare/history output
- Added TTY detection for graceful fallback in non-TTY environments
- Added 60+ integration tests for CLI commands (init, history, compare, report)
- Achieved 80%+ source file test coverage
