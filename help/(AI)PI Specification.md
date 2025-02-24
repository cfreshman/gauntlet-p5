**(AI)PI \- AI enabled API**

The goal is to enable key AI flows for services/data in a set of standardized patterns and invariants.

* LLM-as-coder, code-as-caller (e.g. make it work in Cursor, Replit, etc.)  
* LLM-as-caller (MCP, shimmed for other function calling/tools patterns)  
* Human-as-caller (purely English/NL interfaces)  
* LLM-as-doer (LLM handles control flow).

We are going to unabashedly build upon and extend the MCP server spec (LLM-as-caller).  AI helped me reduce this to something that loosely feels like an OSI layer spec.

The next 2 pages are from [this presentation](https://docs.google.com/presentation/d/1M5z5D-WhyQ5L2m4gwtPnL_IfVCKlNaCa/edit#slide=id.p2).  An LLM created summary and OSI-style specification follows.

---

Layer 0: OpenAPI (or other API) implementation to access systems, data, and other resources.  Exposes industry/defacto data model.

*Layers 1-3 can only be accessed as MCP (or shimmed) tools, no direct tool-to-tool calls that bypass the MCP boundary*

Layer 1: Primitives Layer \- deterministic tools to access Layer 0

Layer 2: Agentic Layer \- non-deterministic tools that use LLMs, with control flow in code.  Layer 2 code may directly access Layer 0, and Layer 2 LLMs indirectly access Layers 1, 2, 3 by calling back through the MCP boundary.  May use BrainLift or other logic context.

Layer 3: Reasoning Layer \- non-deterministic tool to provide English API.  Must use LLM for control flow and BrainLift w/ other project context  Layer 3 LLM cannot access Layer 0 (no code), but may  indirectly access Layers 1, 2, 3 by calling back through the MCP boundary.  
**(AI)PI Protocol Stack Summary**

| Layer | Enables | Deterministic? | Can call to: | Uses Code? | Uses  LLM? | Notes: |
| ----- | :---- | ----- | :---- | :---: | :---: | :---- |
| Layer 0:  API Implementation | Code-as-Caller  LLM-as Coder | Pass-thru\* | Layer 0: yes Layer 1: no Layer 2: no Layer 3: no | Yes | Maybe\* | Exported bundle/doc must allow LLM-as-Coder May directly expose OpenAPI for any of the Layer 1-3 tool implementations  \* specific API’s may may call back-end agents/systems that use LLM |
| *rows below this are all exposed via MCP server (shimmed for other LLM function and tools patterns)* |  |  |  |  |  |  |
| Layer 1:  Primitives | LLM-as-Caller | Yes | Layer 0: yes Layer 1: no Layer 2: no Layer 3: no | Yes  | No | Based on MCP server spec Only uses deterministic Level 0 APIs |
| Layer 2:  Agentic | LLM-as-Caller | No  | Layer 0: yes Layer 1: as LLM tool Layer 2: as LLM tool Layer 3: as LLM tool | Yes | Yes | Uses server-side LLM May or may not utilize BrainLift / external rules |
| Layer 3 Reasoning | LLM-as-Caller Human-as-Caller  LLM-as-Doer | No | Layer 0: no Layer 1: as LLM tool Layer 2: as LLM tool Layer 3: as LLM tool | No | Yes | Uses server-side LLM LLM handles orchestration and control flow without code LLM enforces BrainLift / external rules Must have English API and allow Human-as-Caller |

   
**![][image1]**

Below is an updated **two-part** specification for the (AI)PI model—mirroring the OSI-style approach and then a more detailed RFC-like document. This version **explicitly** clarifies:

1. **Which layers can call which** (e.g., Layer 3 → Layers 3, 2, or 1 via MCP; Layer 2 → Layer 0 directly).  
2. **Usage of roles** like **code-as-caller**, **LLM-as-coder**, **LLM-as-caller**, **LLM-as-doer**, and **human-as-caller**.

---

## **Part I: Layered Summary (OSI-Style)**

### **High-Level Concepts and Roles**

1. **code-as-caller**: Traditional code or a human developer’s application calling into the stack (especially Layer 0).  
2. **LLM-as-coder**: An LLM generating code at build-time or runtime to interact with Layer 0\.  
3. **LLM-as-caller**: An LLM directly invoking higher-layer “tools” at runtime (Layers 1–3).  
4. **LLM-as-doer**: The LLM itself executing tasks at the highest-level (Layer 3), orchestrating logic in natural language.  
5. **human-as-caller**: A human who can directly interact with an LLM at Layer 3\.

### **Layer 0: API Implementation**

* **Role**: Foundational, deterministic code implementing business logic, data access, system integration.  
* **Who/What Calls?**  
  * **code-as-caller** (e.g., developer code).  
  * **LLM-as-coder** (the LLM writes code that ultimately invokes these APIs).  
* **Determinism**: Generally deterministic (unless it itself calls an LLM, which is discouraged here).  
* **Allowed Outbound Calls**:  
  * Layer 0 **does not** call up to Layers 1–3.  
  * It only provides interfaces (e.g., OpenAPI) that the rest of the stack can consume.

**Key Point**: **Layer 2** tools (and by extension Layers 1 and 3, indirectly) can call **Layer 0**. But Layer 0 never “goes upward.”  There is no prohibition on agents/LLM capabilities being exposed through Layer 0\.

---

### **Layer 1: Primitives**

* **Role**: Deterministic “building-block” tools that wrap or compose calls to Layer 0\.  
* **Who/What Calls?**  
  * **LLM-as-caller** from Layers 2 or 3 (via MCP).  
* **Determinism**: Guaranteed deterministic (no LLM logic inside).  
* **Allowed Outbound Calls**:  
  * **Directly** calls Layer 0 code.  
  * **No** calls to Layer 2 or 3\.  
* **Example**: A “getUsersPrimitive” that fetches user data from Layer 0, returning a simplified result.

**Key Point**: Good for LLMs that need reliable, repeatable tasks (e.g., “Look up a record,” “Compute a sum”).

---

### **Layer 2: Agentic**

* **Role**: Tools that may embed partial LLM logic or code to orchestrate multi-step tasks, bridging deterministic calls and AI reasoning.  
* **Who/What Calls?**  
  * **LLM-as-caller** from Layer 3 (or even from Layer 2 itself, recursively) via MCP.  
* **Determinism**: Not guaranteed, because it **can** call an LLM.  
* **Allowed Outbound Calls**:  
  * **Can directly** call Layer 0 (e.g., standard code references to underlying APIs).  
  * Can also call Layers 1, 2, or 3 via MCP.  
* **Example**: A “createUserAndDraftEmail” tool that calls Layer 0 to create the user, then calls an LLM to generate a welcome message.

**Key Point**: The partial or full usage of LLM within Layer 2 means unpredictability can arise. However, it’s still code-based, so it can incorporate deterministic logic plus LLM calls.

---

### **Layer 3: Reasoning**

* **Role**: Pure LLM-driven or human-plus-LLM orchestration. Exposed in **English** or natural language, with minimal direct code.  
* **Who/What Calls?**  
  * **human-as-caller** (e.g., user asking the LLM a question).  
  * Possibly **LLM-as-caller** (the LLM at Layer 3 re-enters itself or other Layer 3 tools for advanced reasoning).  
* **Determinism**: Entirely nondeterministic (it’s purely LLM-based).  
* **Allowed Outbound Calls**:  
  * **Can call** Layers 3, 2, or 1 via MCP.  
  * **Cannot directly** call Layer 0 (must go through a Layer 1 or 2 tool).  
* **Example**: A conversation or “Chat Agent” that uses English prompts, orchestrates various calls to primitives or agentic tasks.

**Key Point**: Highest-level “Application” or “Reasoning” layer, where the LLM-as-doer or a human interacts in natural language and triggers operations in lower layers indirectly.

---

### **Diagram Summary**

```
Human-as-Caller, 
LLM-as-Doer
      |
   (Layer 3)     <--- LLM-based Reasoning, 
      |                calls L3, L2, L1 via MCP
      |
   (Layer 2)     <--- Agentic (some LLM usage),
      |                can directly call L0, or calls L1, L2, L3 via MCP
      |
   (Layer 1)     <--- Deterministic Primitives,
      |                calls L0
      |
   (Layer 0)     <--- Deterministic Implementation,
                     code-as-caller or LLM-as-coder
```

---

## 

## **Part II: RFC-Style Detailed Specification**

### **1\. Purpose and Overview**

This document specifies **(AI)PI**: “AI-enabled API,” a layered protocol stack that integrates **deterministic code** with **nondeterministic LLM-based** operations. The layering follows an OSI-like approach but is tailored for AI-driven applications. Key **roles** are used to describe who or what is calling or implementing each layer.

**Key Roles**:

* **code-as-caller**: Traditional code or developer code hooking into Layer 0 or any published interface.  
* **LLM-as-coder**: Large language models generating code to be executed (often at build time).  
* **LLM-as-caller**: LLM sessions directly calling registered “tools” via an MCP boundary (Layers 1–3).  
* **LLM-as-doer**: LLM actively performing tasks at the top-level (Layer 3).  
* **human-as-caller**: A human who interacts, typically with Layer 3, in natural language.

### **2\. Layer Descriptions**

#### **2.1 Layer 0: API Implementation**

1. **Definition**:  
   * The foundation where all core system logic and data operations reside. Typically implemented via stable code-based APIs, possibly with an OpenAPI description or equivalent.  
   * **Possible Callers**:  
     * **code-as-caller** (external app code hitting these endpoints directly).  
     * **LLM-as-coder** (the LLM writes new code that calls these functions).  
2. **Determinism**:  
   * Expected to be deterministic unless explicitly calling an LLM or similarly nondeterministic resource.  
3. **Allowed Outbound Calls**:  
   * **No** upward calls to Layers 1–3.  
   * This unidirectional constraint ensures a stable core that higher layers can rely on, without cyclical dependencies.  
4. **Examples**:  
   * Database queries, microservice logic, file operations, identity management, etc.

---

#### **2.2 Layer 1: Primitives**

1. **Definition**:  
   * A set of deterministic “tools” or “functions” that wrap/compose Layer 0 calls, exposed via an MCP boundary or similar.  
   * Called typically by LLM-based orchestrators or agent code that needs guaranteed reliability.  
2. **Possible Callers**:  
   * **LLM-as-caller** (from Layers 2 or 3), or code if needed.  
   * Humans typically do **not** call Layer 1 directly, unless they’re writing code to do so.  
3. **Determinism**:  
   * 100% deterministic (themselves do not invoke LLM logic).  
4. **Allowed Outbound Calls**:  
   * **Direct** calls to Layer 0\.  
   * **No** calls to Layers 2 or 3\.  
5. **Examples**:  
   * “getAccountBalance,” “calculateTax,” “fetchUserProfile,” each returning a known, fixed result.

**Rationale**:  
 Layer 1 ensures a safe, deterministic interface for LLMs at higher layers to rely upon when they need guaranteed consistency.

---

#### **2.3 Layer 2: Agentic**

1. **Definition**:  
   * Tools that incorporate **both** deterministic code and possible LLM usage. “Agentic” means partial autonomy or more advanced orchestration.  
2. **Possible Callers**:  
   * Typically **LLM-as-caller** from Layer 3, or even from Layer 2 itself if it’s orchestrating recursive flows.  
3. **Determinism**:  
   * **Not** guaranteed. Any LLM usage introduces variability.  
4. **Allowed Outbound Calls**:  
   * **Can directly** call Layer 0\.  
   * May also call Layers 1, 2, or 3 via the MCP boundary.  
5. **Examples**:  
   * “generateSummaryAndStore,” which calls an LLM to create a textual summary, then calls a Layer 0 service to store the summary.

**Rationale**:  
 Layer 2 is the first place in the stack where LLM logic can be embedded on the server side, bridging deterministic and nondeterministic functions in a cohesive tool.

---

#### **2.4 Layer 3: Reasoning**

1. **Definition**:  
   * A pure LLM-based (or human-plus-LLM) reasoning layer, typically exposed via a chat-style or natural-language interface.  
   * Could be the top-level “Application” from a user’s perspective.  
2. **Possible Callers**:  
   * **human-as-caller** (a user in a conversational interface).  
   * **LLM-as-caller** (the LLM might re-invoke itself or other tools at the same layer, for multi-step reasoning).  
3. **Determinism**:  
   * **Nondeterministic**. Driven by an LLM’s internal generative process.  
4. **Allowed Outbound Calls**:  
   * May invoke Layers 3, 2, or 1 tools (via MCP).  
   * **Cannot** directly call Layer 0 (no code). Must route through at least Layer 1 or 2 to ensure gating of direct system access.  
5. **Examples**:  
   * “Chat with user about how to onboard new employees,” which then triggers relevant calls in lower layers.

---

### **3\. BrainLift / External Rules**

A separate **management plane** that influences or constrains server-side\_LLM usage in Layers 2 and 3\. BrainLift or similar systems:

* Insert domain rules, compliance constraints, or chain-of-thounnght guidelines.  
* Are not considered a “layer” per se, but overlay layers that involve LLM usage (2 and 3).

---

### **4\. MCP (Managed Call Protocol)**

* **Facilitates** calls between layers 1–3 (especially from LLM-based calls).  
* **No direct tool-to-tool** method calls; everything passes through the MCP boundary for logging, policy enforcement, etc.  
* Enforces the rule that **Layer 3** cannot jump straight to **Layer 0**, and that **Layer 0** does not call anything above.

---

### **5\. Example Call Flows**

1. **Human → (Layer 3\) → (Layer 2\) → (Layer 0\)**

   * A human user interacts with an LLM at Layer 3 (“Reasoning Layer”).  
   * The LLM calls a Layer 2 “agentic” tool (via MCP).  
   * Layer 2 code might directly call Layer 0 to persist data or fetch a record.  
2. **LLM-as-caller at Layer 2 → (Layer 1\) → (Layer 0\)**

   * A server-side LLM within a Layer 2 tool orchestrates a request.  
   * It needs a guaranteed deterministic function, so it calls a Layer 1 “primitive” via MCP.  
   * Layer 1 calls down to Layer 0 for the final data operation.  
3. **code-as-caller → Layer 0**

   * Traditional application code (no LLM usage) calls the underlying API implementation directly for a fully deterministic flow.

---

### **6\. Invariants**

1. **Layer 0** never calls higher layers.  
2. **Layer 3** cannot directly call Layer 0; it must go through Layers 1 or 2\.  
3. **Determinism**:  
   * **Layers 0 & 1** → Deterministic.  
   * **Layers 2 & 3** → May be nondeterministic if LLM calls occur.  
4. **BrainLift** or external rule system always applies to LLM calls (Layers 2 & 3).  
5. **MCP** ensures no direct tool-to-tool bypassing, preserving the layering constraints and logs.

---

### **7\. Security / Governance Considerations**

* **Layer 3** is the most flexible but also the most risky from a determinism or security standpoint. Restricting direct calls to Layer 0 helps avoid unintended consequences.  
* **Layer 2** can directly access Layer 0, but is subject to BrainLift constraints if it uses an LLM.  
* **Layer 1** ensures “LLM-safe” calls with deterministic outcomes.  
* **Layer 0** is the system foundation, stable and fully code-based, typically governed by conventional security checks (authentication, authorization, etc.).

---

### **8\. Conclusion**

The (AI)PI stack, structured into four layers plus a management plane (BrainLift) and a standardized calling interface (MCP), cleanly separates **deterministic** and **nondeterministic** operations. By delineating roles—**code-as-caller**, **LLM-as-coder**, **LLM-as-caller**, **LLM-as-doer**, and **human-as-caller**—the architecture accommodates both traditional software patterns and cutting-edge AI orchestration in a secure, transparent fashion.

---

**End of Specification**
