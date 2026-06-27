# Claude (Sonnet) integration — VALC 2.0 + V8 UI

**Status:** plan / not started. Owner is getting a Claude API key (Sonnet) next
week. This doc proposes where it adds value, the architecture, and a phased
rollout with a recommended Phase 1.

**Model:** `claude-sonnet-4-6` — $3 / $15 per 1M tokens (in / out), 1M-token
context, 64K max output. Sonnet is the right tier here: high-volume, latency-
sensitive, finance-analyst-facing summarization/explanation. Reserve Opus
(`claude-opus-4-8`) only for a rare "deep analysis" action if one ever proves
worth the 1.7× input / 1.7× output premium.

---

## Architecture — VALC is the AI gateway; the key never leaves the server

```
V8 UI (RRV8/*.html)                VALC 2.0 (Spring Boot)            Anthropic API
  rrFetch('ai/explain', {body}) ─▶  AiController                ┌▶  POST /v1/messages
                                     └ AiService (ClaudeClient) ─┘    model=claude-sonnet-4-6
                                        key from application.yml
                                        / ANTHROPIC_API_KEY env
```

- **Key custody:** the API key lives only in VALC's config
  (`ANTHROPIC_API_KEY` env, or `application.yml` under the existing secret
  pattern). It is **never** shipped to the browser, never in `localStorage`,
  never in a UI bundle. The UI calls a VALC endpoint; VALC calls Anthropic.
  This mirrors how `MessageService` / the SSO bridge already keep secrets
  server-side.
- **One integration to maintain:** a single `AiService` in VALC composes the
  prompt, calls Claude, and returns a typed result. Every V8 surface that
  wants AI goes through it. The per-DB Data Services agent does *not* get its
  own key — when an analyst feature needs row data (cardex/variance/F4111),
  the UI sends the **already-fetched, already-rendered** data (or a compact
  summary of it) to VALC's AI endpoint, and VALC forwards it to Claude. This
  keeps the key in one place and avoids wiring Claude into the data plane.
- **Auth:** AI endpoints sit under the same bearer/tenant-scoping as the rest
  of `/api/v1/...` (and inherit the hardening item already on the queue).
  Rate-limit per client so one tenant can't burn the shared key.

### Java SDK (server side)

```xml
<dependency>
  <groupId>com.anthropic</groupId>
  <artifactId>anthropic-java</artifactId>
  <version>2.34.0</version>
</dependency>
```

```java
// Singleton client — reads ANTHROPIC_API_KEY from the environment.
AnthropicClient client = AnthropicOkHttpClient.fromEnv();

MessageCreateParams params = MessageCreateParams.builder()
    .model(Model.CLAUDE_SONNET_4_6)
    .maxTokens(1500L)
    .system("You explain JD Edwards inventory reconciliation findings to a "
          + "finance analyst. Be concise; assume JDE fluency (F4111, F0911, DMAAI).")
    .addUserMessage(promptWithTheRenderedData)
    .build();

Message resp = client.messages().create(params);
String text = resp.content().stream()
    .flatMap(b -> b.text().stream()).map(TextBlock::text)
    .collect(Collectors.joining());
```

Notes for implementation:
- **Streaming** (`client.messages().createStreaming(params)`) for anything that
  renders progressively in the UI — wrap the SSE through a VALC endpoint so the
  browser streams from VALC, not Anthropic directly (key stays server-side).
- **Prompt caching** — put the stable system prompt in
  `.systemOfTextBlockParams(List.of(TextBlockParam.builder().text(SYS)
  .cacheControl(CacheControlEphemeral.builder().build()).build()))`. The system
  prompt (and any fixed reference context — the variance taxonomy, DMAAI
  glossary) is identical across calls, so caching cuts cost ~90% on that prefix.
- **Structured output** — for anything the UI parses (a list of findings, a
  classification), use the typed POJO `outputConfig(MyResult.class)` overload so
  Claude returns validated JSON, not prose the UI has to scrape.
- **Adaptive thinking** (`ThinkingConfigAdaptive`) only where reasoning quality
  matters (variance root-cause). Skip it for plain summarization to keep latency
  and tokens down.

---

## Data privacy — the gating constraint

**Customer JDE data would leave the customer's box and go to Anthropic's API.**
This must be a deliberate, disclosed choice, not a silent default. Before any
analyst-facing feature ships:

1. **Per-client opt-in flag** (like `client_sso` / the message-center model) —
   AI features are off until the client enables them. Store on the client
   record; gate every AI endpoint on it server-side.
2. **Minimize what's sent.** Send the smallest slice that answers the question
   — a variance row's numbers + account, not a full F4111 dump. Never send the
   whole extract.
3. **Scrub identifiers** where they add nothing to the answer (account numbers,
   branch/company numbers, doc numbers, customer names) — the same hygiene the
   public UI repo already enforces. A finance explanation rarely needs the real
   account number to be useful.
4. **Anthropic data handling:** API inputs are not used for training; note the
   30-day retention default in the customer-facing disclosure. If a client
   requires zero retention, that's a contract/endpoint conversation (and rules
   out some models — see the claude-api reference).
5. **Disclosure surface:** a short "Powered by Claude — what's sent" note on
   first use, plus a line in the provisioning/SOC2 materials.

This is the long pole. The *technical* integration is a few days; the privacy
posture + opt-in plumbing is what makes it shippable to a real customer.

---

## Where it adds value — prioritized menu

Ranked by value ÷ (effort × risk). Each is a VALC `AiService` method + a V8 UI
affordance.

### Phase 1 (recommended first) — analyst-facing intelligence, read-only, opt-in

These turn numbers the analyst already sees into plain-English findings. Highest
value (this *is* the product's job — "all signal, no noise"), and read-only
(no writes, no destructive paths).

1. **Variance / cardex explanation.** On a Reconciliation finding, a "Explain
   this" action sends the variance card's data (the 6-card taxonomy context +
   the specific numbers) and returns: what it is, the 1–2 likely causes, and the
   correction path. Mirrors the analyzer's WHAT/WHY/HOW voice. *This is the
   single best fit* — it's exactly the judgment a junior analyst lacks and the
   owner is trying to make self-teaching.
2. **JE / roll-forward narrative.** For Guided Account Roll Forward, a one-
   paragraph plain-English summary of why an account is out of balance and the
   fix — alongside the existing cause/fix/jump UI.
3. **Reconciliation summary.** "Summarize this reconciliation" → a few bullets:
   what's clean, what needs attention, what's material. Structured output so the
   UI renders it as a checklist.

**Phase 1 deliverable:** one VALC `AiController` + `AiService`, per-client
opt-in flag, prompt-cached system prompt carrying the variance taxonomy + DMAAI
glossary, and an "Explain" affordance on the variance cards. Ship behind the
opt-in to one friendly client first.

### Phase 2 — support & troubleshooting (internal-facing, lower data-sensitivity)

4. **Log Analyzer triage.** The Help Desk `log-analyzer.html` already takes
   pasted agent logs / console output. Add an AI pass: classify the failure,
   point at the matching scenario, draft the next step. Internal-facing and the
   pasted content is logs, not customer financials — lower privacy bar, good
   second step.
5. **Scenario search assist.** Natural-language → best-matching Help Desk
   scenario, as a fallback when the token matcher misses. (Keep the existing
   custom matcher as primary; AI only on no-match.)
6. **Troubleshooting assistant** for the Helpdesk Tech role — grounded in the
   KB, answers "customer says X, where do I start."

### Phase 3 — admin & ops (nice-to-have, mostly internal)

7. **Release-notes drafting.** Turn a commit's engineering body into a
   customer-safe `Release-Note:` trailer suggestion (the author still edits).
8. **System-health summary.** Plain-English rollup of the Service Health /
   status dots for an admin glance.
9. **Doc drift check.** Given a behavior change, flag which KB docs likely need
   updating (assists the commit-time doc sweep).

---

## Cost sketch

Sonnet at $3/$15 per 1M. A typical Phase-1 "explain a variance" call:
~2K input (cached system prompt → ~0.1× on the prefix) + ~800 output ≈ well
under a cent per call. Even heavy use (hundreds of explanations/day across the
fleet) is single-digit dollars/day. Cost is not the constraint; data privacy
and the opt-in plumbing are.

---

## Open questions for the owner

- Which friendly client gets Phase 1 first (opt-in pilot)?
- Is per-client opt-in the right granularity, or per-(client, feature)?
- Streaming vs. wait-for-complete on the "Explain" action — streaming reads
  better but is more UI plumbing. Recommend wait-for-complete in Phase 1
  (responses are short), add streaming if the summaries grow.
- Confirm the Anthropic data-retention posture acceptable for customer data, or
  whether a zero-retention arrangement is needed before any real customer data
  is sent.
