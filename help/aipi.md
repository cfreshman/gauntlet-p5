# (AI)PI – AI Enabled API

**Goal:**  
Enable key AI flows for services/data using standardized patterns and invariants that bridge deterministic systems and LLM-driven operations.

---

## Key Roles

- **code-as-caller:** Traditional developer-written code.
- **LLM-as-coder:** LLMs generating code to invoke APIs.
- **LLM-as-caller:** LLM sessions calling registered tools.
- **LLM-as-doer:** LLMs orchestrating tasks (control flow).
- **human-as-caller:** Users interacting in natural language.

---

## Layered Architecture (OSI-Style)

### **Layer 0: API Implementation**
- **Purpose:** Core, deterministic APIs (e.g., OpenAPI) for system logic, data access, and integration.
- **Callers:** code-as-caller, LLM-as-coder.
- **Invariant:** Does not call higher layers.

### **Layer 1: Primitives**
- **Purpose:** Deterministic building blocks that wrap Layer 0 operations.
- **Callers:** LLM-as-caller (via MCP).
- **Invariant:** Only calls Layer 0.

### **Layer 2: Agentic**
- **Purpose:** Tools blending deterministic code with LLM logic for multi-step tasks.
- **Callers:** LLM-as-caller from Layer 3 (or recursively within Layer 2) via MCP.
- **Capabilities:** May directly call Layer 0; can call Layers 1–3 via MCP.

### **Layer 3: Reasoning**
- **Purpose:** Pure LLM-driven (or human-plus-LLM) reasoning, providing a natural-language interface.
- **Callers:** human-as-caller, LLM-as-caller.
- **Invariant:** Cannot directly call Layer 0; must route calls through Layer 1 or 2 via MCP.

---

## Model Context Protocol (MCP)
- **Role:** Enforces context preservation, boundary checks, and auditing of inter-layer calls.
- **Functionality:**
  - **Context Preservation:** Carries historical context, metadata, and role identifiers.
  - **Boundary Enforcement:** Ensures safe routing (e.g., Layer 3 never directly accesses Layer 0).
  - **Auditing:** Logs every call for traceability and compliance.
  
---

## Additional Management
- **BrainLift/External Rules:**  
  A management plane that injects domain rules, compliance constraints, and chain-of-thought guidelines into LLM operations (affecting Layers 2 & 3).

---

## Protocol Stack Summary

| Layer                         | Enables                                | Deterministic? | Allowed Calls                                    | Uses Code | Uses LLM |
| ----------------------------- | -------------------------------------- | -------------- | ------------------------------------------------ | --------- | -------- |
| **Layer 0: API Implementation** | Code-as-Caller, LLM-as-Coder             | Yes          | Only to Layer 0                                | Yes       | Maybe    |
| **Layer 1: Primitives**         | LLM-as-Caller                           | Yes          | Only to Layer 0                                | Yes       | No       |
| **Layer 2: Agentic**            | LLM-as-Caller                           | No           | To Layer 0 directly, or Layers 1–3 via MCP       | Yes       | Yes      |
| **Layer 3: Reasoning**          | LLM-as-Caller, human-as-caller, LLM-as-Doer | No           | Only to Layers 1–3 via MCP                       | No        | Yes      |

*All inter-layer calls (Layers 1–3) must pass through MCP.

---

## Example Call Flows

1. **Human → Layer 3 → Layer 2 → Layer 0:**  
   A user interacts in natural language (Layer 3), which triggers a Layer 2 tool via MCP that directly accesses core APIs (Layer 0).

2. **LLM (Layer 2) → Layer 1 → Layer 0:**  
   An LLM tool in Layer 2 calls a deterministic primitive (Layer 1) via MCP; Layer 1 then accesses Layer 0.

3. **code-as-caller → Layer 0:**  
   Traditional application code directly accesses the core API.

---

## Invariants and Security

- **Layer 0:** Never calls higher layers.
- **Layer 3:** Must use MCP to access Layers 1 or 2 (cannot directly call Layer 0).
- **Determinism:**  
  - Layers 0 & 1 are deterministic.  
  - Layers 2 & 3 may be nondeterministic due to LLM usage.
- **Policy Enforcement:** BrainLift and MCP ensure compliance and secure inter-layer interactions.