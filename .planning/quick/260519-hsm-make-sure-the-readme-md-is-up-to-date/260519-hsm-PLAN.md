---
phase: quick
plan: 260519-hsm
type: execute
wave: 1
depends_on: []
files_modified: [README.md]
autonomous: true
requirements: [DOCS-01]
must_haves:
  truths:
    - "README accurately describes all three tools with correct output examples"
    - "README documents both Bun and Node/npx run paths"
    - "MCP client config section shows both Bun and Node alternatives"
    - "update_base_url output example matches actual tool output schema"
    - "article_download output example is present"
  artifacts:
    - path: "README.md"
      provides: "Accurate project documentation"
      contains: "selectedBaseUrl"
  key_links:
    - from: "README.md update_base_url section"
      to: "src/tools/base-url-tools.ts updateBaseUrlOutputSchema"
      via: "output example fields"
      pattern: "selectedBaseUrl"
    - from: "README.md Run section"
      to: "package.json scripts"
      via: "build and start commands"
      pattern: "bun run build"
---

<objective>
Update README.md to accurately reflect what was built in v1.1 and the subsequent quick tasks (npx packaging, security hardening).

Purpose: The README has two correctness bugs (wrong output example under update_base_url, missing article_download output), and is missing the Node/npx run path added in the gki quick task. A developer or MCP client user reading the README will get wrong expectations about tool output and miss that npx is a valid run option.

Output: README.md with correct tool output examples, Node/npx run instructions, and dual Bun/Node MCP client config.
</objective>

<execution_context>
@/Users/guillem/.claude/get-shit-done/workflows/execute-plan.md
@/Users/guillem/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@/Users/guillem/vault/projects/_tools/annas-mcp/.planning/PROJECT.md
@/Users/guillem/vault/projects/_tools/annas-mcp/README.md
@/Users/guillem/vault/projects/_tools/annas-mcp/package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix tool output examples and add Node/npx run path</name>
  <files>README.md</files>
  <action>
Make the following targeted edits to README.md:

**1. Fix update_base_url output example (critical bug)**

The current README shows article_download output (article + sources) under update_base_url. Replace with the actual output schema from updateBaseUrlOutputSchema in src/tools/base-url-tools.ts:

```json
{
  "selectedBaseUrl": "annas-archive.li",
  "checkedAt": "2026-05-19T10:00:00.000Z",
  "source": "https://en.wikipedia.org/wiki/Anna%27s_Archive",
  "selector": "infobox link cell",
  "mode": "automatic",
  "revisionEvidence": {
    "thresholdIso": "2026-05-18T10:00:00.000Z",
    "revisionsScanned": 12,
    "usedContinuation": false
  },
  "candidates": [
    {
      "host": "annas-archive.li",
      "latestRevisionSeen": true,
      "seenBeforeThreshold": true,
      "trusted": true
    }
  ]
}
```

When ANNAS_BASE_URL is set, mode is "manual_override" and a note field is present explaining that the manual URL remains active.

**2. Add article_download output example**

After the article_download input block, add a "Structured output:" section matching articleDownloadOutputSchema (article + sources). Use the same example that is currently (wrongly) shown under update_base_url — it belongs here:

```json
{
  "article": {
    "doi": "10.1038/nature12345",
    "title": "Example Paper",
    "hash": "md5-hash",
    "pageUrl": "https://annas-archive.li/md5/md5-hash",
    "downloadUrl": "https://annas-archive.li/scidb?doi=10.1038%2Fnature12345"
  },
  "sources": [
    {
      "type": "fast_download",
      "url": "https://..."
    },
    {
      "type": "scidb",
      "url": "https://annas-archive.li/scidb?doi=10.1038%2Fnature12345"
    }
  ]
}
```

**3. Add Node/npx run path to the Run section**

The existing Run section only shows `bun run src/server.ts`. Add a Node/npx subsection after the Bun block:

For Node.js (without Bun):
- First build: `bun run build` (or `npm run build`)
- Then run: `node dist/server.js`
- Or via npx after publish: `npx annas-mcp`

Note: `dist/` is gitignored; build before first Node run.

**4. Add Node alternative to MCP Client Configuration**

After the existing Bun JSON block, add a second example for Node:

```json
{
  "mcpServers": {
    "annas-mcp-ts": {
      "command": "node",
      "args": ["/absolute/path/to/annas-mcp/dist/server.js"],
      "env": {
        "ANNAS_SECRET_KEY": "your-api-key"
      }
    }
  }
}
```

Note that dist/server.js must be built first (`bun run build` or `npm run build`).

**5. Clarify ANNAS_BASE_URL default behavior in Configure section**

The current copy says it "defaults to annas-archive.li". This is only the code-level fallback. When ANNAS_BASE_URL is not set, the server primarily uses automatic mirror discovery/cache (via update_base_url). Revise to:

"When ANNAS_BASE_URL is not set, the server uses automatic mirror discovery from Wikipedia (via update_base_url) and falls back to annas-archive.li if no cache is available."

Do not change any other section wording — keep all existing content intact.
  </action>
  <verify>
    <automated>grep -n "selectedBaseUrl" /Users/guillem/vault/projects/_tools/annas-mcp/README.md && grep -n "bun run build" /Users/guillem/vault/projects/_tools/annas-mcp/README.md && grep -n "dist/server.js" /Users/guillem/vault/projects/_tools/annas-mcp/README.md</automated>
  </verify>
  <done>
    - update_base_url output shows selectedBaseUrl, checkedAt, candidates[], mode fields
    - article_download output example is present with article + sources structure
    - Run section documents bun run build and node dist/server.js
    - MCP client config has a Node/node alternative block
    - ANNAS_BASE_URL configure copy accurately describes discovery-first behavior
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| README (docs) | No trust boundary — documentation only |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-hsm-SC | Tampering | No package installs in this task | accept | Documentation-only change, no supply chain surface |
</threat_model>

<verification>
After edit, verify all four changes are present:

1. `grep "selectedBaseUrl" README.md` — must match
2. `grep "bun run build" README.md` — must match
3. `grep "dist/server.js" README.md` — must match (Node MCP config)
4. `grep '"article"' README.md` — must appear under article_download section
</verification>

<success_criteria>
README accurately documents:
- All three tools with correct input/output examples
- Both Bun and Node/npx run paths
- Dual MCP client config (Bun + Node)
- Correct ANNAS_BASE_URL behavior (discovery-first, not hardcoded default)
</success_criteria>

<output>
Create `.planning/quick/260519-hsm-make-sure-the-readme-md-is-up-to-date/260519-hsm-SUMMARY.md` when done.
</output>
