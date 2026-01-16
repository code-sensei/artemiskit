---
"@artemiskit/adapter-anthropic": patch
"@artemiskit/adapter-openai": patch
"@artemiskit/adapter-vercel-ai": patch
"@artemiskit/cli": patch
"@artemiskit/core": patch
"@artemiskit/redteam": patch
"@artemiskit/reports": patch
---

Initial release of ArtemisKit - LLM Evaluation Toolkit

Features:
- Scenario-based evaluation with YAML test definitions
- Multiple expectation types: contains, exact, regex, fuzzy, llm_grader, json_schema
- Red team security testing (injection, jailbreak, extraction, hallucination, PII)
- Stress testing with configurable concurrency and latency metrics
- PII/sensitive data redaction with built-in and custom patterns
- Interactive HTML reports with run comparison
- Multi-provider support: OpenAI, Azure OpenAI, Anthropic
- Local and Supabase storage backends
