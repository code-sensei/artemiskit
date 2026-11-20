---
'@artemiskit/core': patch
---

Allow `setup.toolLoop.timeoutMs` up to one hour (was five minutes). Reasoning models can take
minutes per call, so multi-step tool loops against them hit the old cap. The default stays 60 s.
