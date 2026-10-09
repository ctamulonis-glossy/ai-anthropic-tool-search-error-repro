// A failed Anthropic tool search cannot be sent back on the next step.
// No API key needed: fetch is mocked with the response Anthropic returns for an invalid pattern.
import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

// What Anthropic answers when the model's regex is invalid (or longer than 200 characters).
const failedSearchResponse = {
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-4-5',
  content: [
    { type: 'server_tool_use', id: 'srvtoolu_1', name: 'tool_search_tool_regex', input: { pattern: '([' } },
    { type: 'tool_search_tool_result', tool_use_id: 'srvtoolu_1', content: { type: 'tool_search_tool_result_error', error_code: 'invalid_tool_input' } },
    { type: 'tool_use', id: 'toolu_1', name: 'add', input: { a: 1, b: 1 } },
  ],
  stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
};
const textResponse = { ...failedSearchResponse, id: 'msg_2', content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn' };

const requests = [];
const fetch = async (_url, init) => {
  requests.push(JSON.parse(init.body));
  return Response.json(requests.length === 1 ? failedSearchResponse : textResponse);
};
const tools = {
  tool_search_tool_regex: anthropic.tools.toolSearchRegex_20251119(),
  add: tool({ inputSchema: z.object({ a: z.number(), b: z.number() }), execute: async ({ a, b }) => a + b }),
};
const model = createAnthropic({ apiKey: 'not-used', fetch })('claude-sonnet-4-5');
let failed = false;

// 1. generateText: step 1 omits the tool_search_tool_result, so Anthropic would answer 400
//    ("tool_search_tool_regex tool use ... without a corresponding tool_search_tool_result block").
const result = await generateText({ model, tools, prompt: 'Find a tool, then add 1 and 1.', stopWhen: stepCountIs(2) });
const sent = requests[1]?.messages[1]?.content ?? [];
console.log('1. generateText, step 1 assistant blocks sent:', sent.map(b => b.type).join(', '));
console.log('   step 1 warnings:', JSON.stringify(result.steps[1]?.warnings));
if (!sent.some(b => b.type === 'tool_search_tool_result' && b.tool_use_id === 'srvtoolu_1')) {
  console.log('   BUG: the failed search result (error-json) was dropped; server_tool_use srvtoolu_1 is orphaned');
  failed = true;
}

// 2. The same error result with output type 'json' (how frameworks that persist provider-executed results replay it) throws.
try {
  await model.doGenerate({
    tools: [{ type: 'provider', id: 'anthropic.tool_search_regex_20251119', name: 'tool_search_tool_regex', args: {} }],
    prompt: [
      { role: 'user', content: [{ type: 'text', text: 'Find a tool.' }] },
      { role: 'assistant', content: [
        { type: 'tool-call', toolCallId: 'srvtoolu_1', toolName: 'tool_search_tool_regex', input: { pattern: '([' }, providerExecuted: true },
        { type: 'tool-result', toolCallId: 'srvtoolu_1', toolName: 'tool_search_tool_regex', output: { type: 'json', value: { type: 'tool_search_tool_result_error', errorCode: 'invalid_tool_input' } } },
      ] },
      { role: 'user', content: [{ type: 'text', text: 'Try again.' }] },
    ],
  });
  console.log('2. json error value: request built');
} catch (error) {
  console.log(`2. json error value: BUG: ${error.name}: ${error.message.split('\n')[0]}`);
  failed = true;
}
process.exit(failed ? 1 : 0);
