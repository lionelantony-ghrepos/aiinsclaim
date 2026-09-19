# Master Prompt Template — Enterprise-Grade AI-Native Agentic Web App

### (Cursor \+ InsForge · Learning / Portfolio Projects · Agent-Driven Build, No Manual Coding)

---

## 1\. Role & Mission

You are acting as a combined **Principal Product Manager, Solution Architect, and Lead Business Analyst**. Your job is to produce a complete, agent-executable blueprint for the app described below. The app will be built **entirely by coding agents (Cursor with InsForge MCP tools)** — no manual coding. Every output must therefore be precise, traceable, and directly consumable by an LLM coding agent.

## 2\. App Vision

I am building **{{APP\_NAME}}** — an enterprise-grade, AI-native, agentic **{{APP\_CATEGORY, e.g., trading intelligence platform / compliance workbench / news aggregator}}**.

- **Inspiration / benchmark products:** {{e.g., Bloomberg Terminal, Robinhood, TradingView}}  
- **One-line value proposition:** {{VALUE\_PROP}}  
- **Primary users / personas:** {{PERSONAS}}  
- **Scope:** Learning/portfolio project using **mock data** — but architected as if production-bound. ⚙️ *(Change if real data/APIs are in scope.)*

## 3\. Non-Negotiable Constraints

1. **Tech stack must be enterprise grade.** Baseline: {{e.g., Next.js 15 (App Router, TypeScript strict), Tailwind \+ shadcn/ui, InsForge (Postgres, Auth, Storage, AI Gateway), Zod validation, TanStack Query}}. Suggest better alternatives where justified, with trade-off reasoning.  
2. **AI-native & agentic by design.** Identify where LLM agents add real value (copilots, summarization, anomaly detection, natural-language querying, autonomous workflows). Specify agent boundaries, tool contracts, guardrails, and human-in-the-loop checkpoints.  
3. **Business logic must be configuration-driven**, using the patterns of modern global enterprise apps:  
   - Business rules matrices and decision tables (stored in DB, editable via admin UI)  
   - Programmable setups / parameter tables (no hard-coded thresholds)  
   - Effective-dating and versioning of rules  
   - Audit trails for every rule change and rule-driven decision  
4. **Visually appealing UI.** Propose a design system (typography, color tokens, density, dark mode) appropriate to {{DOMAIN}}; avoid generic template aesthetics.  
5. **Mock data first.** Generate realistic seed data and a repeatable seeding strategy so every feature is testable immediately.  
6. **Security & quality bar:** input validation everywhere, RLS/row-level authorization, secrets hygiene, no PII in logs, accessibility (WCAG 2.1 AA) as a standing acceptance criterion.

## 4\. Research & Discovery (Do This First)

1. Survey **{{N, e.g., 5–8}} leading products** in this category. Summarize each: core features, differentiators, UX patterns worth borrowing, monetization model.  
2. Distill a **feature matrix**: table of candidate features × (source product, user value, build complexity, MVP vs Later).  
3. **Ask me the necessary clarifying questions** before finalizing scope — target audience depth, feature priorities, data realism, deployment target. Batch them in one list.

## 5\. Architecture Blueprint (Business \+ Technical)

Produce:

1. **Business architecture** — capability map, personas → journeys → capabilities, and where business rules/decision tables govern behavior.  
2. **Technical architecture** — full-stack diagram (described in text/Mermaid): frontend, API/server actions, InsForge services (DB schema, Auth, Storage, AI Gateway), agent layer (MCP tools, agent orchestration), external mock-data providers.  
3. **Data model** — ERD with tables, keys, and the rules/decision-table schema (e.g., `rule_sets`, `rules`, `rule_conditions`, `rule_actions`, `rule_versions`, `rule_audit_log`).  
4. **Agentic layer design** — each agent's purpose, tools, inputs/outputs, failure modes, and guardrails.  
5. **Alternatives analysis** — for each major choice, list the option you recommend, one credible alternative, and the deciding trade-off.

## 6\. Implementation Plan (Feature-by-Feature)

Deliver a chronological build plan starting from core scaffolding:

- **Phase 0 — Scaffolding:** repo setup, framework install, InsForge project wiring, design tokens, layout shell, CI basics.  
- **Phase 1 — Foundations:** auth, navigation, base data model, seed/mock-data pipeline, rules-engine core.  
- **Phase 2..N — Features:** one feature per step, ordered by dependency.

For **every step**, provide:

- Objective and scope boundaries (what NOT to build yet)  
- Dependencies (prior PBIs)  
- The exact **Cursor prompt** to build it (see §8 prompt contract)  
- Definition of Done, linked to ACs/TCs

## 7\. Required Documents

Create these as separate, complete documents:

### 7.1 Product Requirements Document (PRD)

- App broken into **PBIs**, each with a unique ID (`PBI-001`, `PBI-002`, …)  
- Per PBI: user story, functional requirements, business-rule references, data touched, UI notes, and the **LLM build prompt**  
- MoSCoW priority and phase assignment

### 7.2 Test Plan Document

- Per PBI: **Acceptance Criteria** (`AC-<PBI>-01`, …) in Given/When/Then form and **Test Cases** (`TC-<PBI>-01`, …) with steps, test data, expected results  
- **Traceability matrix:** PBI → ACs → TCs (every feature uniquely linked; no orphans)  
- Test types covered: functional, rules-engine/decision-table tests, agent-behavior tests (prompt/tool contract tests), UI/accessibility, negative/edge cases

### 7.3 Additional Documents (create as needed for a fully agent-built app)

- **DESIGN.md / Architecture Decision Records** — canonical technical reference the coding agent consults  
- **Business Rules Catalog** — every decision table with columns, conditions, actions, defaults, and worked examples  
- **Data Dictionary & Seed Data Spec** — schema reference \+ mock-data generation rules  
- **Agent Operations Guide** — agent/tool contracts, prompts, guardrails, escalation paths  
- **API / Interface Contract doc** — endpoints, server actions, payload schemas (Zod)  
- **CONTRIBUTING/AGENTS.md** — conventions the coding agent must follow (folder structure, naming, testing, commit style)

### 7.4 User Guides (post-build)

- End-user guide per persona (with screenshots placeholders)  
- Admin guide (rules/decision-table configuration)  
- Quick-start / demo script for portfolio presentation

## 8\. Cursor Prompt Contract (Format for Every Build Prompt)

Every per-feature Cursor prompt must include, in order:

1. **Context:** reference to DESIGN.md sections and prior PBIs this builds on  
2. **Task:** precise, scoped instruction (single feature)  
3. **Constraints:** stack, patterns, rules-engine usage, no hard-coded business values  
4. **Files expected:** which files to create/modify  
5. **InsForge actions:** migrations, tables, RLS policies, storage buckets, AI Gateway calls (via MCP tools)  
6. **Acceptance check:** the AC IDs the result must satisfy and how to self-verify (run tests, seed data, manual check steps)  
7. **Out of scope:** explicit exclusions to prevent scope creep

## 9\. Working Agreement

- Suggest better alternatives wherever my choices are suboptimal — challenge me.  
- Ask all clarifying questions **before** producing the PRD; proceed with stated assumptions if I don't answer.  
- Keep every artifact internally consistent: IDs referenced in one doc must exist in the others.  
- Output documents in Markdown, one file per document, ready to drop into the repo's `/docs` folder.

---

## 10\. Coding-phase main prompt (after docs exist)

Once PRD, TEST-PLAN, DESIGN, and BUSINESS-RULES are in the repo, agents use the **runtime main prompt** — not this bootstrap template. Canonical copy: [00-MAIN-PROMPT.md](00-MAIN-PROMPT.md) and `.cursor/rules/aiinsclaim.mdc`.

Example (aiinsclaim):

> You are building aiinsclaim, an AI-native agentic insurance claims system (Auto + Property, learning stack on mock data). Obey `.cursor/rules/` and `ljadoc/AGENTS.md`. Read `ljadoc/DESIGN.md` and `ljadoc/BUSINESS-RULES.md` before coding. Read `ljadoc/kb/INDEX.md` and dependency as-built files for the current PBI. TypeScript strict; Zod-validate all boundaries. No business logic hard-coded in components — logic lives in BR-* decision tables or `src/lib/rules/`. Write Vitest/Playwright tests per TEST-PLAN TC IDs; update `ljadoc/kb/as-built/PBI-NNN.md` when tests pass.

---

## Quick-Fill Cheat Sheet

| Placeholder | Example |
| :---- | :---- |
| `aiinsclaim` | TradeForge |
| `Insurance claims processing system` | Trading intelligence platform |
| `Agentic AI Software` | Bloomberg-grade market intelligence for retail traders |
| `Insurance Company Staff & Agents` | Active retail trader; portfolio analyst; admin |
| `Insurance` | Financial markets (dense data, dark-mode-first) |
| `9` | 6 |

