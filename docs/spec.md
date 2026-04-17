# Product Spec: Document-Native Analytics Runtime

## 1. Vision

Build a system where:

> Writing a document is the same act as building a data tool.

Users define data logic as step-by-step, composable blocks.  
Each step is executed, cached, and reusable.  
Interfaces (tables, charts, dashboards) are generated automatically.

AI accelerates entry, but structure guarantees correctness, performance, and reuse.

---

## 2. Core Problem

Current analytics workflows are fragmented:

- SQL is monolithic and duplicated
- Dashboards hide logic and are hard to modify
- Docs are static and untrustworthy
- AI generates answers that don’t scale or compose

Result:
- Slow iteration
- Poor performance
- No reuse
- Low trust

---

## 3. Core Insight

> AI generates answers.  
> Systems require structure.

This product converts:
- unstructured queries
- vague questions

into:
- structured, composable, cached computation graphs

---

## 4. MVP Scope

### 4.1 Primary Use Case

> Build complex analytics queries step-by-step, with automatic caching and instant visualization.

---

## 5. Core Capabilities

### 5.1 Step-Based Query Composition

Users write documents with sequential SQL blocks:

Block 1 → Block 2 → Block 3 → Output


Each block:
- references previous blocks (`ref:n`)
- produces a result set
- is independently inspectable

---

### 5.2 Incremental Execution

- Each block result is cached (temp materialization)
- When a block changes:
  - only downstream blocks recompute
- Upstream results are reused

---

### 5.3 Intermediate Visibility

Users can:
- inspect outputs at every step
- debug logic visually
- understand transformations

---

### 5.4 Generated Interfaces

Blocks render automatically as:

- tables (default)
- charts (basic: bar)

No manual UI building required.

---

### 5.5 Lightweight Branching (MVP)

Users can:
- edit a block
- immediately see downstream effects

(No full local propagation model required in MVP)

---

### 5.6 Shareable Artifacts

- Documents can be shared as read-only links
- Viewers see:
  - rendered tables
  - charts
  - final outputs

---

## 6. AI Layer (Secondary Demo)

### 6.1 Flow

Vague Question → Structured Plan → Decomposed Document


### 6.2 Output

AI generates:
- step-by-step plan
- multiple SQL blocks
- one visualization

Example:

Input:
> "Why did revenue drop?"

Output:
- base query
- join step
- aggregation
- comparison

---

### 6.3 Constraints

AI must:
- produce decomposed structure
- not produce monolithic SQL
- output editable blocks

AI is:
> input acceleration, not system logic

---

## 7. Differentiation

### 7.1 Against Raw SQL

| Problem | Solution |
|--------|---------|
| Monolithic queries | Step decomposition |
| Duplication | Reusable blocks |
| Poor performance | Cached steps |
| Hard to debug | Visible intermediates |

---

### 7.2 Against Dashboards

| Problem | Solution |
|--------|---------|
| Hidden logic | Explicit blocks |
| Hard to modify | Editable steps |
| No reuse | Referencable outputs |

---

### 7.3 Against AI Tools

| Problem | Solution |
|--------|---------|
| Unstructured output | Structured pipelines |
| Poor performance | Incremental caching |
| No reuse | Persistent graph |

---

### 7.4 Against Tools like Retool

| Retool | This System |
|--------|-------------|
| UI-first | Computation-first |
| Query chaining | Explicit graph |
| Reactive chaos | Deterministic execution |
| Performance degrades | Incremental recompute |

---

## 8. Key Demo

### Demo A — Structured Analytics

1. Paste large SQL query
2. Break into steps
3. Show intermediate results
4. Modify upstream filter
5. Only downstream recomputes
6. Chart updates instantly

---

### Demo B — AI vs Reality

1. Prompt AI → generate SQL
2. Run → slow / messy
3. Same prompt in system:
   - decomposed blocks
   - cached execution
   - fast result

Key message:

> AI generates answers. We make them scalable.

---

## 9. Technical Architecture (MVP)

### 9.1 Components

#### Document
- ordered list of blocks

#### Block
- SQL string
- parsed IR (lightweight)
- dependencies
- cached result (temp table)

---

### 9.2 Execution Engine

For each run:

1. Parse SQL → IR
2. Resolve dependencies
3. Build DAG (linear is fine)
4. Execute blocks:
   - if unchanged → reuse cache
   - if changed → recompute

---

### 9.3 Materialization

- Each block stored as temp table
- Naming: doc_<id>block<n>
- Reused across downstream steps

---

## 10. Runtime Model (Future)

### 10.1 Author Sessions

- stateful
- allow local propagation
- use temp tables
- interactive

---

### 10.2 Reader Sessions

- mostly read canonical outputs
- use pooled execution
- limited ephemeral compute

---

### 10.3 Pricing Model

Users segmented by cost:

- Viewer → cheap (read-only)
- Explorer → medium (local compute)
- Builder → expensive (authoring + recompute)

---

## 11. Key Principles

### 11.1 Structure First
All logic must be decomposed and explicit.

### 11.2 Incremental by Default
Never recompute unnecessarily.

### 11.3 Source of Truth = Document
UI is derived, never canonical.

### 11.4 Exploration is Safe
Local changes do not affect shared state until committed.

### 11.5 AI is Assistive
AI accelerates creation but does not replace structure.

---

## 12. Success Criteria (MVP)

A user can:

1. Paste complex SQL
2. Split into steps
3. See intermediate results
4. Modify step 1
5. Only steps 2–N recompute
6. View updated chart instantly

And say:

> “This is better than writing one big query.”

---

## 13. Final Statement

> Build a system where analytics is not a collection of queries, but a structured, executable document — where every step is visible, reusable, and incrementally maintained.
