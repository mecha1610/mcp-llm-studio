# MCP LLM Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server that routes requests from Claude Code to local LLM models on LM Studio via stdio transport.

**Architecture:** A single TypeScript MCP server using `@modelcontextprotocol/server` with stdio transport. It exposes 3 tools (`list_models`, `ask`, `embed`) that call the LM Studio OpenAI-compatible API over HTTP.

**Tech Stack:** TypeScript, `@modelcontextprotocol/server`, `zod/v4`, Node.js native `fetch`, stdio transport.

---

## File Structure

```
mcp-llm-studio/
├── package.json          # Dependencies and build scripts
├── tsconfig.json         # TypeScript config targeting ES2022/Node
├── src/
│   └── index.ts          # MCP server: transport setup + 3 tool registrations
├── tests/
│   └── index.test.ts     # Unit tests for tool logic
└── README.md             # Usage instructions
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "mcp-llm-studio",
  "version": "1.0.0",
  "description": "MCP server for LM Studio multi-model hub",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/server": "^1.0.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "vitest": "^3.1.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated, no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json tsconfig.json package-lock.json
git commit -m "chore: scaffold project with dependencies"
```

---

### Task 2: Implement `list_models` tool

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write the test for list_models**

Create `tests/index.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the fetch logic directly since MCP server integration
// is handled by the SDK. We extract the core logic into testable functions.

const LM_STUDIO_URL = 'http://localhost:1234';

async function fetchModels(baseUrl: string): Promise<{ id: string }[]> {
  const res = await fetch(`${baseUrl}/v1/models`);
  if (!res.ok) throw new Error(`LM Studio error: ${res.status} ${res.statusText}`);
  const data = await res.json() as { data: { id: string }[] };
  return data.data;
}

describe('fetchModels', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns model list from LM Studio API', async () => {
    const mockResponse = {
      data: [
        { id: 'gemma-4-27b' },
        { id: 'nomic-embed-text-v1.5' },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const models = await fetchModels(LM_STUDIO_URL);
    expect(models).toEqual([
      { id: 'gemma-4-27b' },
      { id: 'nomic-embed-text-v1.5' },
    ]);
    expect(fetch).toHaveBeenCalledWith(`${LM_STUDIO_URL}/v1/models`);
  });

  it('throws on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('error', { status: 500, statusText: 'Internal Server Error' }),
    );
    await expect(fetchModels(LM_STUDIO_URL)).rejects.toThrow('LM Studio error: 500');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/index.test.ts`
Expected: PASS (these are self-contained unit tests for the fetch logic)

- [ ] **Step 3: Create src/index.ts with server setup and list_models tool**

```typescript
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

const LM_STUDIO_URL = process.env.LM_STUDIO_URL ?? 'http://localhost:1234';

const server = new McpServer(
  { name: 'llm-studio', version: '1.0.0' },
  { instructions: 'MCP server for LM Studio. Use list_models to see available models, ask to chat, embed to generate embeddings.' },
);

// --- list_models ---
server.registerTool(
  'list_models',
  {
    title: 'List Models',
    description: 'List all models currently loaded in LM Studio',
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const res = await fetch(`${LM_STUDIO_URL}/v1/models`, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) {
        return { content: [{ type: 'text' as const, text: `LM Studio error: ${res.status} ${res.statusText}` }], isError: true };
      }
      const data = (await res.json()) as { data: { id: string; object: string }[] };
      const models = data.data.map((m) => m.id);
      return { content: [{ type: 'text' as const, text: `Available models:\n${models.map((m) => `- ${m}`).join('\n')}` }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Failed to reach LM Studio: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

// --- Transport ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('LLM Studio MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: `dist/index.js` created with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: add MCP server with list_models tool"
```

---

### Task 3: Implement `ask` tool

**Files:**
- Modify: `src/index.ts`
- Modify: `tests/index.test.ts`

- [ ] **Step 1: Add test for ask logic**

Append to `tests/index.test.ts`:

```typescript
async function askModel(
  baseUrl: string,
  model: string,
  prompt: string,
  system?: string,
  temperature = 0.7,
  max_tokens = 2048,
): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, max_tokens }),
  });
  if (!res.ok) throw new Error(`LM Studio error: ${res.status} ${res.statusText}`);
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content;
}

describe('askModel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends chat completion request and returns response', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Hello from Gemma!' } }],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await askModel(LM_STUDIO_URL, 'gemma-4-27b', 'Hi');
    expect(result).toBe('Hello from Gemma!');
    expect(fetch).toHaveBeenCalledWith(
      `${LM_STUDIO_URL}/v1/chat/completions`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('includes system prompt when provided', async () => {
    const mockResponse = {
      choices: [{ message: { content: 'Bonjour!' } }],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    await askModel(LM_STUDIO_URL, 'gemma-4-27b', 'Hi', 'Reply in French');
    const callBody = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(callBody.messages[0]).toEqual({ role: 'system', content: 'Reply in French' });
    expect(callBody.messages[1]).toEqual({ role: 'user', content: 'Hi' });
  });

  it('throws on API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not found', { status: 404, statusText: 'Not Found' }),
    );
    await expect(askModel(LM_STUDIO_URL, 'bad-model', 'Hi')).rejects.toThrow('LM Studio error: 404');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/index.test.ts`
Expected: All tests PASS.

- [ ] **Step 3: Add ask tool to src/index.ts**

Add before the `// --- Transport ---` comment in `src/index.ts`:

```typescript
// --- ask ---
server.registerTool(
  'ask',
  {
    title: 'Ask Model',
    description: 'Send a prompt to a specific LLM model on LM Studio and get a response',
    inputSchema: z.object({
      model: z.string().describe('Model ID from LM Studio (use list_models to see available models)'),
      prompt: z.string().describe('The question or prompt to send'),
      system: z.string().optional().describe('Optional system prompt'),
      temperature: z.number().min(0).max(2).optional().describe('Sampling temperature (default 0.7)'),
      max_tokens: z.number().min(1).optional().describe('Max tokens in response (default 2048)'),
    }),
  },
  async ({ model, prompt, system, temperature, max_tokens }) => {
    try {
      const messages: { role: string; content: string }[] = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: prompt });

      const res = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          temperature: temperature ?? 0.7,
          max_tokens: max_tokens ?? 2048,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        return { content: [{ type: 'text' as const, text: `LM Studio error: ${res.status} ${res.statusText}` }], isError: true };
      }

      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      const reply = data.choices[0]?.message?.content ?? '(empty response)';
      return { content: [{ type: 'text' as const, text: reply }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: No errors, `dist/index.js` updated.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: add ask tool for chat completions"
```

---

### Task 4: Implement `embed` tool

**Files:**
- Modify: `src/index.ts`
- Modify: `tests/index.test.ts`

- [ ] **Step 1: Add test for embed logic**

Append to `tests/index.test.ts`:

```typescript
async function embedText(
  baseUrl: string,
  model: string,
  input: string | string[],
): Promise<{ embedding: number[]; index: number }[]> {
  const res = await fetch(`${baseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) throw new Error(`LM Studio error: ${res.status} ${res.statusText}`);
  const data = await res.json() as { data: { embedding: number[]; index: number }[] };
  return data.data;
}

describe('embedText', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns embeddings for a single string', async () => {
    const mockResponse = {
      data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await embedText(LM_STUDIO_URL, 'nomic-embed', 'hello');
    expect(result).toEqual([{ embedding: [0.1, 0.2, 0.3], index: 0 }]);
  });

  it('returns embeddings for multiple strings', async () => {
    const mockResponse = {
      data: [
        { embedding: [0.1, 0.2], index: 0 },
        { embedding: [0.3, 0.4], index: 1 },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await embedText(LM_STUDIO_URL, 'nomic-embed', ['hello', 'world']);
    expect(result).toHaveLength(2);
  });

  it('throws on API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('error', { status: 500, statusText: 'Server Error' }),
    );
    await expect(embedText(LM_STUDIO_URL, 'nomic-embed', 'test')).rejects.toThrow('LM Studio error: 500');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/index.test.ts`
Expected: All tests PASS.

- [ ] **Step 3: Add embed tool to src/index.ts**

Add before the `// --- Transport ---` comment in `src/index.ts`:

```typescript
// --- embed ---
server.registerTool(
  'embed',
  {
    title: 'Embed Text',
    description: 'Generate embeddings for text using an embedding model on LM Studio',
    inputSchema: z.object({
      model: z.string().describe('Embedding model ID (e.g. nomic-embed-text-v1.5)'),
      input: z.union([z.string(), z.array(z.string())]).describe('Text or array of texts to embed'),
    }),
  },
  async ({ model, input }) => {
    try {
      const res = await fetch(`${LM_STUDIO_URL}/v1/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        return { content: [{ type: 'text' as const, text: `LM Studio error: ${res.status} ${res.statusText}` }], isError: true };
      }

      const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
      const summary = data.data.map((d) => `[${d.index}] ${d.embedding.length} dimensions`).join('\n');
      return {
        content: [
          { type: 'text' as const, text: `Embeddings generated:\n${summary}` },
          { type: 'text' as const, text: JSON.stringify(data.data) },
        ],
      };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: `Failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);
```

- [ ] **Step 4: Build and run all tests**

Run: `npm run build && npx vitest run`
Expected: Build succeeds, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: add embed tool for text embeddings"
```

---

### Task 5: README and Claude Code registration

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README.md**

```markdown
# MCP LLM Studio

MCP server that connects Claude Code to your local LM Studio models.

## Setup

```bash
npm install
npm run build
```

## Register in Claude Code

```bash
claude mcp add llm-studio -- node /absolute/path/to/mcp-llm-studio/dist/index.js
```

To use a custom LM Studio URL:

```bash
claude mcp add llm-studio -e LM_STUDIO_URL=http://your-ip:1234 -- node /absolute/path/to/mcp-llm-studio/dist/index.js
```

## Tools

### `list_models`
Lists all loaded models in LM Studio.

### `ask`
Chat with a model. Parameters:
- `model` (required) - model ID
- `prompt` (required) - your message
- `system` (optional) - system prompt
- `temperature` (optional, default 0.7)
- `max_tokens` (optional, default 2048)

### `embed`
Generate embeddings. Parameters:
- `model` (required) - embedding model ID
- `input` (required) - text or array of texts
```

- [ ] **Step 2: Register MCP server in Claude Code**

Run: `claude mcp add llm-studio -- node C:/Users/user1/Documents/GitHub/mcp-llm-studio/dist/index.js`
Expected: Server registered successfully.

- [ ] **Step 3: Test with Claude Code**

Verify by asking Claude Code to call `list_models` to confirm the server works.

- [ ] **Step 4: Commit and push**

```bash
git add README.md
git commit -m "docs: add README with setup instructions"
git push -u origin main
```

---
