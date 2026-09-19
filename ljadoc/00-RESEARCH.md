# 00 — Market Research & Feature Matrix

**App:** aiinsclaim — enterprise-grade, AI-native, agentic insurance claims processing system (Auto + Property/Home)
**Date:** 2026-07-07 · **Method:** live web survey of 9 leading products

---

## 1. Product Survey (9 products)

### 1.1 Guidewire ClaimCenter
- **What it is:** The dominant enterprise P&C claims core system. Covers FNOL intake, adjuster assignment and workload balancing, reserve management, litigation tracking, subrogation, payment processing.
- **Differentiators:** Depth of P&C domain model; packaged AI solutions; enterprise-proven configuration patterns; huge partner ecosystem.
- **UX patterns worth borrowing:** Claim file as a single "workspace" (parties, exposures, documents, financials, activities in tabs); activity/task-driven workflow; supervisor dashboards with workload views.
- **Monetization:** Enterprise license + implementation ($500k–$2M+, 12–24 month deployments).

### 1.2 Duck Creek Claims
- **What it is:** Cloud-native claims administration on a low-code configuration model.
- **Differentiators:** Configuration-over-code (business rules externalized, editable by analysts); API-first; 6–12 month implementations.
- **UX patterns worth borrowing:** Low-code rules/decision-table admin UI; adjuster desktop with immediate policy/coverage context at FNOL.
- **Monetization:** SaaS subscription per DWP/seat tiers.

### 1.3 Five Sigma (Clive™)
- **What it is:** AI-native claims management platform with "Clive", a multi-agent AI claims adjuster co-worker.
- **Differentiators:** Multi-agent architecture as first-class product; AI-assisted triage, assignment, reserve tracking; targets MGAs and specialist carriers — the gap between spreadsheets and Guidewire.
- **UX patterns worth borrowing:** AI recommendations rendered inline in the claim file with accept/override affordances; automated claim summaries at every stage.
- **Monetization:** SaaS per claim volume / per seat.

### 1.4 Snapsheet
- **What it is:** Cloud claims platform born from virtual auto appraisal, extended to broader P&C.
- **Differentiators:** Virtual/photo-based vehicle damage appraisal; configurable "Snapsheet AI" — customers control how AI collects and operationalizes claim data; strong digital payments.
- **UX patterns worth borrowing:** Guided photo-capture FNOL for claimants; appraisal workbench with side-by-side photos + estimate lines.
- **Monetization:** SaaS + per-transaction (appraisal, payment) fees.

### 1.5 Tractable
- **What it is:** Computer-vision AI for auto and property damage assessment.
- **Differentiators:** Deep-learning damage estimation from photos; deploys as an AI layer on top of existing claims cores.
- **UX patterns worth borrowing:** Photo → itemized damage assessment with confidence scores; human review queue for low-confidence estimates.
- **Monetization:** Per-assessment API pricing / enterprise contracts.

### 1.6 CCC Intelligent Solutions (CCC ONE)
- **What it is:** Cloud auto-claims estimating ecosystem with AI-driven damage assessment and insurer/repair-shop network integration.
- **Differentiators:** Network effects (insurers + repair shops + parts suppliers on one platform); straight-through estimating; acquired EvolutionIQ to add claims-guidance AI.
- **UX patterns worth borrowing:** Estimate workflow with catalog-driven line items; status visible to all parties.
- **Monetization:** Per-transaction + subscription across network participants.

### 1.7 Shift Technology
- **What it is:** AI decisioning suite for insurance — fraud detection, claims automation, underwriting risk.
- **Differentiators:** Fraud scoring with explainable alerts; SIU case management from referral to closure; proves meaningful automation can sit on top of existing cores.
- **UX patterns worth borrowing:** Fraud alert cards with reason codes and evidence trails; referral → investigation workflow; automation of *legitimate* claims (fast-track) as the headline metric.
- **Monetization:** Enterprise annual contracts (hundreds of k to millions).

### 1.8 Lemonade (AI Jim)
- **What it is:** Consumer insurer whose claims bot settles simple claims end-to-end — world record 2-second payout.
- **Differentiators:** Conversational FNOL; runs anti-fraud algorithms inline; instant payment for low-risk claims; human handoff for everything else.
- **UX patterns worth borrowing:** Chat-style guided FNOL; instant-decision "green lane" with transparent handoff to humans; claim status as a simple timeline.
- **Monetization:** Direct insurer (premiums); AI is cost-side advantage.

### 1.9 EvolutionIQ (now part of CCC)
- **What it is:** "Claims guidance" AI for disability/injury/workers' comp — scores and prioritizes open claims daily, telling adjusters which claims need attention and why.
- **Differentiators:** Continuous re-scoring of the whole open inventory (not just at FNOL); next-best-action recommendations; measurable cycle-time reduction.
- **UX patterns worth borrowing:** Daily prioritized worklist ("today's 10 claims that need you") with reason codes; nudges instead of gates.
- **Monetization:** Enterprise SaaS.

---

## 2. Synthesis — What "Great" Looks Like in 2026

1. **Core + AI overlay converging:** incumbents add AI; AI-natives (Five Sigma) build the core around agents. aiinsclaim should be **agent-native core** — the Five Sigma pattern.
2. **Configuration-driven rules** (Duck Creek) are table stakes: decision tables editable by business users, effective-dated, audited.
3. **Straight-through processing with a green lane** (Lemonade/Shift): automate legitimate low-risk claims; route the rest to humans with reasons.
4. **Continuous claim scoring** (EvolutionIQ): triage is not a one-time event; re-score on every material change.
5. **Human-in-the-loop as UX, not afterthought** (Tractable/Five Sigma): every AI output has confidence, reason codes, and accept/override controls, all audited.
6. **Photo/document intelligence** (Snapsheet/Tractable/CCC): document extraction and damage assessment from images are the highest-value AI insertion points.

## 3. Feature Matrix

| # | Candidate Feature | Source / Benchmark | User Value | Build Complexity | Phase |
|---|---|---|---|---|---|
| F01 | Guided FNOL intake wizard (web, multi-step, per line of business) | Lemonade, Snapsheet | Very high | Medium | **MVP** |
| F02 | Claim lifecycle state machine (intake→triage→assessment→settlement→closed) | Guidewire | Very high | Medium | **MVP** |
| F03 | Rules engine + decision tables (DB-stored, effective-dated, versioned) | Duck Creek | Very high | High | **MVP** |
| F04 | Admin UI for rules/decision tables with audit trail | Duck Creek | High | Medium | **MVP** |
| F05 | Triage agent: severity/complexity scoring + routing via decision table | Five Sigma, EvolutionIQ | Very high | Medium | **MVP** |
| F06 | Fraud scoring (decision table + LLM narrative-anomaly signals) | Shift, Lemonade | Very high | Medium | **MVP** |
| F07 | Document upload + OCR/LLM extraction (police report, invoice, estimate) | Sprout.ai, Snapsheet | Very high | Medium | **MVP** |
| F08 | Human-in-the-loop task queues with accept/override + reason capture | Tractable, Five Sigma | Very high | Medium | **MVP** |
| F09 | SLA timers, breach detection, escalation rules | Guidewire | High | Medium | **MVP** |
| F10 | Reserve suggestion + tracking | Guidewire, Five Sigma | High | Medium | **MVP** |
| F11 | Settlement authority matrix + payment issuance (mock) | Guidewire | High | Medium | **MVP** |
| F12 | Claim summary agent (auto-generated, updated on change) | Five Sigma | High | Low | **MVP** |
| F13 | Adjuster prioritized worklist with reason codes | EvolutionIQ | High | Medium | **MVP** |
| F14 | Ops dashboards (cycle time, SLA breaches, fraud referrals, STP rate) | Shift, Guidewire | High | Medium | **MVP** |
| F15 | Claims copilot — natural-language querying over claims data | Five Sigma | Medium | Medium | Later |
| F16 | Photo damage assessment (CV, mocked via LLM vision) | Tractable, CCC | Medium | High | Later |
| F17 | Customer comms drafting agent (emails/letters) | Five Sigma | Medium | Low | Later |
| F18 | Claimant self-service status portal | Lemonade, CCC | Medium | Medium | Later |
| F19 | SIU case management (referral→investigation→closure) | Shift | Medium | High | Later |
| F20 | Subrogation & litigation tracking | Guidewire | Low (portfolio) | High | Later |
| F21 | Repair-network / vendor management | CCC | Low (portfolio) | High | Later |
| F22 | Catastrophe event tagging & bulk triage | Guidewire | Medium | Medium | Later |

**MVP cut:** F01–F14 — a complete intake→triage→assessment→settlement loop that is agent-native, rules-driven, and human-supervised. F15–F22 are deferred to keep the agent-built scope crisp.

## 4. Sources

- [Duck Creek vs Guidewire ClaimCenter (Slashdot 2026)](https://slashdot.org/software/comparison/Duck-Creek-Claims-vs-Guidewire-ClaimCenter/)
- [Claims Management Software Options 2026 (Viewpoint Analysis)](https://www.viewpointanalysis.com/post/claims-management-software-options-2026)
- [Duck Creek vs Guidewire: AI Integration (AppIT)](https://www.appitsoftware.com/blog/duck-creek-vs-guidewire-ai-integration-capabilities)
- [Best Claims Management Software 2026 (Regure)](https://www.getregure.com/blog/best-claims-management-software-2026/)
- [Five Sigma — AI-native claims / Clive](https://fivesigmalabs.com/)
- [Snapsheet AI](https://www.snapsheetclaims.com/products/snapsheet-ai)
- [Shift Technology](https://www.shift-technology.com/)
- [Shift + Guidewire fraud accelerator](https://www.shift-technology.com/shift-and-guidewire-for-fraud-and-subrogation)
- [Shift integrated case management (PR Newswire)](https://www.prnewswire.com/news-releases/shift-technology-debuts-integrated-case-management-for-claims-fraud-detection-302018645.html)
- [Lemonade 2-second claim record (AI Magazine)](https://aimagazine.com/articles/lemonade-sets-world-record-with-2-second-ai-insurance-claim)
- [Lemonade world record blog](https://www.lemonade.com/blog/lemonade-sets-new-world-record/)
- [Lemonade: right claims to right adjuster (Carrier Management)](https://www.carriermanagement.com/features/2024/05/23/262470.htm)
- [Sprout.ai claims AI (InsurTech Digital)](https://insurtechdigital.com/articles/sprout-ai-ai-improving-claims-process-for-customers)
- [Top 10 AI claim processing tools (DevOpsSchool)](https://www.devopsschool.com/blog/top-10-ai-insurance-claim-processing-tools-in-2025-features-pros-cons-comparison/)
