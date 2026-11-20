---
'@artemiskit/adapter-openai': patch
'@artemiskit/core': patch
---

Keep provider round-trip data on tool calls. Gemini's OpenAI-compatible endpoint attaches a
`thought_signature` (in `extra_content`) to each tool call and rejects the next turn with HTTP 400
if it is missing. The OpenAI adapter now preserves `extra_content` on returned tool calls, and the
prompt tool loop and agent-workflow engine send it back unchanged, so multi-step tool use works with
Gemini 3 and later models.
