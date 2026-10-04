# Frame & Speak · MCP

The Frame & Speak practice coach as a remote MCP server with an interactive card (MCP Apps), for ChatGPT, Claude and other MCP clients.
The server holds no keys and calls no model: the user's own assistant writes the guides and feedback.

## Tools

| Tool | Card | What it does |
|---|---|---|
| `draw_topic(lang, deck, chart_type?)` | practice card | Random life / work / chart topic with framework, per-step phrases, and the chart |
| `show_guide(lang, topic, framework, steps…)` | practice card | The assistant writes a guide for the user's own situation |
| `show_feedback(lang, scores, fixes, polished, speech, vocab…)` | feedback card | Scores, fixes, model answer, marked read-aloud script with playback, vocab |
| `list_frameworks(lang)` | — | Built-in frameworks |

Prompts: `practice`, `my_situation`.

## Commands

```bash
npm run build      # re-extract data from ../index.html and bundle the card
npm run dev        # local server at http://localhost:8787/mcp
npm test           # build, then smoke-test a running local server
npm run deploy     # build and deploy to Cloudflare Workers
```

`src/shared/data.js` is generated from `../index.html`; edit topics and phrases there, then rebuild.
`dist/demo.html?demo&view=guide|zh|feedback|<chart type>` previews the card without a host.

## Connect

- ChatGPT: Settings → Apps & Connectors → Advanced → Developer mode, then create a connector with your server URL (`https://<worker>.<subdomain>.workers.dev/mcp`), no auth.
- Claude: Settings → Connectors → Add custom connector, same URL.

## Limits

`wrangler.jsonc` caps MCP calls at 300 per minute (Workers Rate Limiting, counted per Cloudflare location); over the cap, clients get HTTP 429 with a bilingual "try again in a minute" error. Rejected calls still count toward the Workers daily request quota (100k/day on the free plan). Hard protection before the Worker needs a custom domain plus a Cloudflare WAF rate-limiting rule.
