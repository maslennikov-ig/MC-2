# Building LLM-powered document editing systems in 2025

The optimal architecture for production document editing combines **patch-based operations** (achieving 31% token reduction), **tiered intent classification** (cutting costs by 67-85%), and **native structured output enforcement** (guaranteeing 100% schema compliance). Rather than regenerating entire documents, modern systems use RFC 6902 JSON Patch operations guided by constrained decoding, with lightweight routers bypassing LLMs entirely for deterministic operations like delete and move.

This approach matters because naive document editing—sending full content to LLMs and regenerating everything—creates prohibitive costs and latency at scale. Research from Lightricks' JSON Whisperer paper demonstrates that patch-based editing maintains quality within **5% of full regeneration** while dramatically reducing token usage. Combined with semantic routing that achieves sub-100ms classification, production systems can handle thousands of edits daily with predictable costs.

The landscape has matured significantly since 2024. OpenAI now offers `apply_patch` with V4A diff format, Anthropic provides `str_replace_based_edit_tool` with undo support, and constrained decoding libraries like Outlines guarantee syntactically valid JSON from any model. Course editing platforms, CMS systems, and no-code builders can now implement reliable document manipulation without building custom parsers or suffering from malformed LLM outputs.

---

## RFC 6902 JSON Patch delivers the foundation for efficient editing

The JSON Whisperer research from Lightricks (EMNLP 2025) established that LLMs can reliably generate RFC 6902 diff patches when properly prompted. Their EASE (Explicitly Addressed Sequence Encoding) technique solves the critical challenge of array manipulation by transforming positional arrays into dictionaries with **stable two-character keys** and a `list_display_order` field tracking sequence.

Standard array indexing causes LLMs to miscalculate index shifts when elements are removed—if you delete item 2, items 3+ shift down, but LLMs frequently miss these cascading changes. EASE eliminates this by making operations **order-invariant**: patches reference stable keys like `"ax"` or `"cd"` rather than indices that shift during editing.

```python
# EASE transformation: arrays become keyed dictionaries
# Original: {"items": ["A", "B", "C"]}
# Transformed: {"items": {"ax": "A", "cd": "B", "ef": "C"}, "list_display_order": "ax,cd,ef"}

# RFC 6902 patch to remove "B":
[
  {"op": "remove", "path": "/items/cd"},
  {"op": "replace", "path": "/list_display_order", "value": "ax,ef"}
]
```

The **trustcall** library (989 GitHub stars) implements this pattern natively with LangGraph, using JSON Patch for schema updates during extraction. Its core philosophy—"Patch Don't Post"—prompts LLMs to generate patches for existing data rather than complete replacements, preventing accidental deletions that plague full-regeneration approaches.

For JavaScript implementations, **fast-json-patch** provides the most performant RFC 6902 implementation with duplex mode supporting both patch application and generation. Its `observe()` / `generate()` pattern enables tracking changes to objects and automatically generating the corresponding patches:

```javascript
const jsonpatch = require('fast-json-patch');

// Validate before applying (critical for LLM-generated patches)
const errors = jsonpatch.validate(llmGeneratedPatch, document);
if (errors === undefined) {
  const result = jsonpatch.applyPatch(
    document,
    jsonpatch.deepClone(patch),
    true, // validate operations
    true // ban prototype modifications
  );
  return result.newDocument;
}
```

The recommended prompt pattern includes explicit RFC 6902 instruction, few-shot examples (which the JSON Whisperer paper found provide **substantial performance improvements**), and a rationale field encouraging the LLM to explain its approach before generating patches:

```
You are an expert at generating JSON patches to update document definitions.
Analyze the current document and requested changes, then generate RFC 6902 patches.

Output as JSON with fields:
- rationale: explain the problem and your approach
- json_diff_patch: RFC 6902 patches [{"op": "replace|add|remove", "path": "/...", "value": ...}]
- is_unsupported: true if the request is unrelated or would break schema

All array indices are 0-based. For remove operations on arrays, generate patches
in reverse index order to avoid shift errors.
```

---

## Function calling enables granular document operations

OpenAI's `apply_patch` tool (introduced with GPT-5.1) represents the most sophisticated approach for file operations, using a custom V4A diff format trained into the model. It supports three operations—add file, update file (with rename via `Move to:`), and delete file—making it well-suited for multi-file refactoring in course content systems where lessons span multiple files.

```python
# OpenAI apply_patch workflow
RESPONSE_INPUT = """
<BEGIN_FILES>
===== content/lesson-1.json
{"title": "Introduction", "sections": [...]}
===== content/lesson-2.json
{"title": "Fundamentals", "sections": [...]}
<END_FILES>

User query: Rename the Fundamentals lesson to "Core Concepts" and add a new prerequisites section
"""

response = client.responses.create(
    model="gpt-5.2",
    input=RESPONSE_INPUT,
    tools=[{"type": "apply_patch"}],
)
```

Anthropic's `str_replace_based_edit_tool` takes a command-based approach with explicit operations: VIEW, CREATE, STR_REPLACE, INSERT, DELETE, and crucially, **UNDO_EDIT**. This undo capability makes it particularly valuable for document editing workflows where users may want to revert changes:

```python
response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    tools=[{
        "type": "text_editor_20250728",
        "name": "str_replace_based_edit_tool",
        "max_characters": 10000
    }],
    messages=[{"role": "user", "content": "Fix the typo in section 3"}]
)

# Claude generates command-based edits:
# {"command": "str_replace", "path": "/content.json",
#  "old_str": "definately", "new_str": "definitely"}
```

For custom document editing schemas, the key is designing **granular operations with explicit constraints**. A well-designed CRUD schema for course content includes operation types as enums, JSON Pointer paths for targeting, and options for behavior control:

```json
{
  "name": "course_edit",
  "strict": true,
  "parameters": {
    "type": "object",
    "properties": {
      "operation": { "type": "string", "enum": ["INSERT", "UPDATE", "DELETE", "MOVE"] },
      "target": {
        "type": "object",
        "properties": {
          "type": { "type": "string", "enum": ["module", "lesson", "section", "quiz"] },
          "path": { "type": "string", "description": "JSON Pointer (e.g., /modules/0/lessons/2)" }
        },
        "required": ["type", "path"]
      },
      "content": { "description": "New content for INSERT/UPDATE" },
      "destination": { "type": "string", "description": "Target path for MOVE operations" },
      "options": {
        "type": "object",
        "properties": {
          "preserve_children": { "type": "boolean", "default": true },
          "validate_schema": { "type": "boolean", "default": true }
        }
      }
    },
    "required": ["operation", "target"],
    "additionalProperties": false
  }
}
```

Multi-tool chaining follows a **Read → Analyze → Edit → Validate** pattern. System prompts should enforce this sequence explicitly, and parallel tool calls can be enabled for independent operations (like updating both header and footer simultaneously):

```python
# System prompt for sequential execution
"""
When editing course content, follow this sequence:
1. Use read_content to get the current lesson/module
2. Use analyze_structure to understand content relationships
3. Use apply_edit to make changes
4. Use validate_content to verify schema compliance and learning objectives

If validation fails, diagnose the issue and retry the edit. Never skip validation.
"""
```

---

## Targeted context strategies reduce costs by up to 98%

Progressive context loading—loading only what's needed when needed—achieves **98% token reduction** (from 150K to 2K tokens) while maintaining accuracy. This approach uses skill metadata with triggers (file patterns), dependencies, and token budgets to load context modularly:

```yaml
# Context loading configuration for course editing
skill_id: course.content_editing
triggers:
  - '*.lesson.json'
  - '*.module.json'
dependencies:
  - schemas/course-schema.json
  - rules/content-guidelines.md
token_budget: 2000
```

For large course structures with hundreds of lessons, embedding-based relevance detection identifies which sections are relevant to an edit request without loading everything. The process embeds document chunks and the edit query, uses cosine similarity to find matches, then sends only high-similarity chunks to the LLM:

```python
class CourseEditContextManager:
    def __init__(self, embedding_model, max_context_tokens=8000):
        self.embedding_model = embedding_model
        self.max_context_tokens = max_context_tokens

    def get_relevant_context(self, course_content, edit_request, k=3):
        # Chunk course by structural boundaries
        chunks = self.chunk_course_content(course_content)

        # Embed chunks and query
        chunk_embeddings = self.embedding_model.encode([c['text'] for c in chunks])
        query_embedding = self.embedding_model.encode(edit_request)

        # Find most relevant chunks
        similarities = cosine_similarity([query_embedding], chunk_embeddings)[0]
        top_indices = similarities.argsort()[-k:][::-1]

        return [chunks[i] for i in top_indices]
```

Chunking strategies for structured JSON must preserve hierarchy. LlamaIndex's HierarchicalNodeParser creates multi-level chunks (2048/512/128 tokens) where each node references its parent, enabling automatic context expansion when multiple children are retrieved:

```python
from llama_index.core.node_parser import HierarchicalNodeParser

node_parser = HierarchicalNodeParser.from_defaults(
    chunk_sizes=[2048, 512, 128]  # Module → Lesson → Section
)
nodes = node_parser.get_nodes_from_documents(course_documents)
```

The **reference-based approach** sends IDs instead of full content. For course editing, this means sending a structural outline with content IDs, having the LLM specify which IDs need modification, then loading only those sections for detailed editing. This is particularly effective for curricula where modules follow predictable patterns.

Aider's search/replace format offers a middle ground between full regeneration and JSON Patch—**86% reduction in output tokens** with a simple sed-like format that's easy for LLMs to generate:

```
lesson-5.json
<<<<<<< SEARCH
"title": "Introduction to Variables",
"duration": "15 minutes"
=======
"title": "Understanding Variables",
"duration": "20 minutes"
>>>>>>> REPLACE
```

---

## Intent classification routes requests efficiently before LLM calls

A two-tier routing architecture achieves **67-85% cost reduction** while maintaining 95%+ of full LLM accuracy. The first tier uses lightweight semantic classification (sub-100ms), and only complex or ambiguous requests escalate to expensive LLM calls.

**Semantic Router** from Aurelio Labs provides the fastest decision-making by routing based on vector similarity rather than LLM calls:

```python
from semantic_router import Route
from semantic_router.routers import SemanticRouter
from semantic_router.encoders import OpenAIEncoder

# Define routes for course editing operations
routes = [
    Route("delete", ["remove this lesson", "delete the quiz", "clear this section"]),
    Route("update", ["change the title", "modify the content", "edit the description"]),
    Route("add", ["add a new lesson", "insert a quiz", "create a section"]),
    Route("move", ["move this module", "reorder the lessons", "relocate the quiz"]),
    Route("rewrite", ["improve the wording", "enhance the explanation", "rephrase this"])
]

router = SemanticRouter(encoder=OpenAIEncoder(), routes=routes)
result = router("delete the prerequisites section")  # Returns Route with name and confidence
```

Operations that can bypass LLMs entirely include **delete** (when target is explicitly selected), **move/reorder** (when source and destination are specified), **format changes** (bold, heading levels), and **simple find/replace**. These deterministic operations need only pattern matching and direct document manipulation:

```python
def should_bypass_llm(intent: str, context: dict) -> bool:
    deterministic_intents = {"delete", "move", "format", "duplicate"}
    has_explicit_target = context.get("selection") is not None
    return intent in deterministic_intents and has_explicit_target

def route_edit_request(request: str, context: dict) -> dict:
    # Tier 1: Semantic classification (~10-50ms)
    intent_result = semantic_router(request)

    # Check for deterministic handling
    if should_bypass_llm(intent_result.name, context):
        return {"handler": "deterministic", "intent": intent_result.name}

    # Tier 2: Complexity classification for LLM routing
    complexity = complexity_classifier.predict(request)

    if complexity == "simple":
        return {"handler": "fast_llm", "model": "claude-haiku"}
    else:
        return {"handler": "powerful_llm", "model": "claude-sonnet"}
```

**RouteLLM** from LMSYS provides a mature framework for this routing, with matrix factorization routers achieving **85% cost reduction while maintaining 95% GPT-4 performance**. It includes calibration tools to set thresholds based on your actual query distribution:

```python
from routellm.controller import Controller

client = Controller(
    routers=["mf"],  # Matrix factorization router
    strong_model="gpt-4o",
    weak_model="claude-haiku",
)

# Threshold calibrated for 50% strong model usage
response = client.chat.completions.create(
    model="router-mf-0.116",  # Router + threshold
    messages=[{"role": "user", "content": edit_request}]
)
```

---

## Structured output guarantees eliminate parsing failures

OpenAI's structured outputs claim **100% schema compliance** using context-free grammar constraints, a significant leap from GPT-4-turbo's ~40% compliance on complex schemas. The implementation uses `response_format` with JSON Schema or function calling with `strict: true`:

```python
from openai import OpenAI
from pydantic import BaseModel, Field
from typing import List

class LessonEdit(BaseModel):
    operation: str = Field(..., pattern="^(insert|update|delete|move)$")
    target_path: str = Field(..., description="JSON Pointer to the target element")
    content: str | None = None

class EditResponse(BaseModel):
    reasoning: str
    edits: List[LessonEdit]

client = OpenAI()
response = client.beta.chat.completions.parse(
    model="gpt-4o-2024-08-06",
    response_format=EditResponse,
    messages=[{"role": "user", "content": f"Edit this course: {course_json}\n\nRequest: {edit_request}"}]
)
```

Anthropic launched native structured outputs in November 2025 for Claude Sonnet 4.5 and Opus 4.1, using constrained decoding that compiles JSON schemas into grammars restricting token generation. First requests incur grammar compilation latency, but schemas are **cached for 24 hours**:

```python
import anthropic

client = anthropic.Client()
response = client.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": edit_request}],
    output_config={
        "format": {
            "type": "json_schema",
            "schema": lesson_edit_schema
        }
    }
)
```

For self-hosted models, **Outlines** provides the most robust constrained decoding, compiling JSON schemas into finite state machines for O(1) token lookup. Its new Rust core (outlines-core) achieves 2x faster compilation:

```python
from outlines import models, generate
from pydantic import BaseModel

class CourseEdit(BaseModel):
    operation: str
    target: str
    content: str | None

model = models.transformers("meta-llama/Llama-3.1-8B-Instruct")
generator = generate.json(model, CourseEdit)
result = generator("Delete the introduction from module 3")
```

The **Instructor** library provides the best multi-provider solution with automatic retry on validation failure. It sends validation errors back to the LLM as context, achieving near-100% success rates within 3 retries:

```python
import instructor
from openai import OpenAI
from pydantic import BaseModel, field_validator

class CourseEdit(BaseModel):
    operation: str
    target_path: str

    @field_validator('target_path')
    def validate_path(cls, v):
        if not v.startswith('/'):
            raise ValueError("Path must start with /")
        return v

client = instructor.from_openai(OpenAI(), max_retries=3)
result = client.chat.completions.create(
    model="gpt-4o",
    response_model=CourseEdit,
    messages=[{"role": "user", "content": edit_request}]
)
```

OpenRouter's Response Healing plugin (December 2025) provides additional reliability as middleware, automatically fixing malformed JSON with **80-99.8% defect rate reduction** depending on the model.

---

## Production architecture brings everything together

A production course editing system combines all these patterns into a cohesive pipeline. The architecture starts with intent classification, routes deterministic operations directly to handlers, and sends complex edits through a JSON Patch generation pipeline with structured output guarantees:

```python
class CourseEditingSystem:
    def __init__(self):
        self.semantic_router = SemanticRouter(routes=self._edit_routes())
        self.context_manager = CourseContextManager()
        self.patch_generator = instructor.from_openai(OpenAI(), max_retries=3)

    def process_edit(self, course: dict, request: str, context: dict) -> dict:
        # 1. Classify intent
        intent = self.semantic_router(request)

        # 2. Handle deterministic operations
        if self._is_deterministic(intent.name, context):
            return self._execute_deterministic(course, intent.name, context)

        # 3. Get relevant context for complex edits
        relevant_sections = self.context_manager.get_relevant(course, request)

        # 4. Generate JSON Patch with structured output
        edit_response = self.patch_generator.chat.completions.create(
            model="gpt-4o",
            response_model=PatchResponse,
            messages=[{
                "role": "system",
                "content": PATCH_GENERATION_PROMPT
            }, {
                "role": "user",
                "content": f"Course sections: {json.dumps(relevant_sections)}\n\nEdit: {request}"
            }]
        )

        # 5. Validate and apply patches
        patch = jsonpatch.JsonPatch(edit_response.patches)
        errors = self._validate_patch(patch, course)
        if errors:
            return self._retry_with_errors(course, request, errors)

        return patch.apply(course)
```

Key implementation patterns for specific platforms:

- **Course/curriculum editors**: Use EASE encoding for lesson ordering within modules, semantic routing for intent (add lesson vs. reorder vs. delete), and hierarchical chunking matching curriculum structure (program → course → module → lesson → section)

- **CMS content management**: Combine `str_replace_based_edit_tool` for text editing with JSON Patch for structural changes, implement undo via Anthropic's native support or by storing patch history

- **No-code builders**: Function calling with granular tools (add_component, update_props, delete_element) maps directly to builder operations, with deterministic handlers for drag-drop and property panel edits

- **Document collaboration tools**: Progressive context loading critical for large documents, reference-based approaches sending section IDs reduce context while maintaining edit precision

---

## Recommendations for getting started

For teams building course editing systems specifically, begin with this implementation sequence:

Start with **Instructor + Pydantic** for immediate structured output reliability without infrastructure changes. Define schemas matching your course structure (modules, lessons, sections, quizzes), and Instructor's retry logic handles the remaining edge cases.

Add **Semantic Router** for intent classification as your second step. Train routes on actual user edit requests from your platform, starting with the five core intents (add, update, delete, move, rewrite). Measure classification accuracy against a held-out test set before production deployment.

Implement **JSON Patch generation** once intent routing is stable. Use fast-json-patch for patch application and validation, and consider EASE encoding if your courses have frequently reordered lists (lesson sequences, quiz questions).

Build **deterministic handlers** for delete, move, and format operations. These bypass LLMs entirely when users make explicit selections, dramatically reducing costs for common operations.

Add **context optimization** last, when document size becomes a bottleneck. Start with hierarchical chunking matching your course structure, then add embedding-based relevance detection for courses exceeding context windows.

The key repositories to reference are **trustcall** (Python, JSON Patch + LangGraph), **fast-json-patch** (JavaScript, RFC 6902 implementation), **semantic-router** (intent classification), **Instructor** (structured outputs with retry), and **Outlines** (constrained decoding for self-hosted models). The JSON Whisperer paper provides the theoretical foundation for patch-based editing with its EASE encoding technique.
