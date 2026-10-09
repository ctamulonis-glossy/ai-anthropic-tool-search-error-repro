# @ai-sdk/anthropic: a failed tool search cannot be sent back

`npm install && npm run repro` (no API key; `fetch` replays the response Anthropic returns for an invalid tool-search regex).

It exits 1 while the bug exists:

1. `generateText` sends the failed search back as `error-json`; the converter drops it, leaving an orphaned `server_tool_use` (Anthropic answers 400).
2. The same error with output type `json` (how frameworks that persist provider-executed results replay it) throws `AI_TypeValidationError`.
