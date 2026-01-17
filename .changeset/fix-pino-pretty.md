---
"@artemiskit/core": patch
---

fix: move pino-pretty from devDependencies to dependencies

Fixes runtime error "unable to determine transport target for pino-pretty" 
when running the CLI after global npm install.
