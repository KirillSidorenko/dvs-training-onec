import { createInterface } from "node:readline";
import { calls, instructions, tools } from "./tools.mjs";

function toolResult(value, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
    isError,
  };
}

function respond({ method, params }) {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        instructions,
        serverInfo: { name: "diversity-training", version: "0.6.0" },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools };
    case "tools/call": {
      const name = params?.name;
      if (!Object.hasOwn(calls, name)) {
        return toolResult({ message: `Команда ${name} недоступна.` }, true);
      }
      const [value, isError] = calls[name](params.arguments ?? {});
      return toolResult(value, isError);
    }
    default:
      return null;
  }
}

for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" },
    }) + "\n");
    continue;
  }
  if (!Object.hasOwn(request, "id")) continue;
  const result = respond(request);
  const reply = { jsonrpc: "2.0", id: request.id };
  if (result === null) reply.error = { code: -32601, message: "Method not found" };
  else reply.result = result;
  process.stdout.write(JSON.stringify(reply) + "\n");
}
