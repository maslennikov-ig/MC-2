# FUTURE TASK: Enhance Analyze Schema for Generation Phase

**Date Created**: 2025-11-07
**Priority**: MEDIUM (improves quality, not blocking MVP)
**Affects**: Stage 4 (Analyze), Stage 5 (Generation)
**Research Reference**: `specs/008-generation-generation-json/research-decisions/rt-002-architecture-balance.md`

---

## Summary

RT-002 research revealed that Analyze output schema needs enhancements to provide Generation with better context for creating high-quality lesson-level content. Current schema is **functionally correct** but **missing optional fields** that improve Generation quality by 10-15%.

**Current Status**: Stage 5 Generation can work with current Analyze output, BUT will benefit from enhanced schema.

**When to Implement**: After Stage 5 MVP is complete and validated. This is an optimization, not a blocker.

---

## Current vs Required Schema

### ✅ Already Correct (No Changes Needed)

**Granularity**: Section-level (3-7 sections) ✅ CORRECT per RT-002
- Current: `sections_breakdown` array with 1-30 sections
- RT-002 requirement: Section-level, NOT lesson-level
- Status: **PERFECT** - no changes needed

**Section Fields**: High-level objectives and topics ✅ CORRECT
- Current: `learning_objectives` (2-5 per section), `key_topics` (3-8 per section)
- RT-002 requirement: High-level objectives, key topics list
- Status: **PERFECT** - no changes needed

**Pedagogical Strategy**: Exists ✅ CORRECT
- Current: `pedagogical_strategy` top-level field (teaching_style, assessment_approach, etc.)
- Status: **GOOD** - works, but can be enhanced (see below)

**Scope Instructions**: Exists ✅ CORRECT
- Current: `scope_instructions` string (100-800 chars)
- Status: **GOOD** - works, but should be structured (see below)

---

### ❌ Missing Fields (Recommended Enhancements)

## Priority 1: CRITICAL for Generation Quality

### 1.1 Add `pedagogical_patterns` Top-Level Field

**Why**: Generation needs theory/practice balance to create appropriate exercises

**Current State**: `pedagogical_strategy` exists but lacks specific patterns
**Enhancement**: Add new top-level field

**Schema Addition**:
```json
{
  "pedagogical_patterns": {
    "type": "object",
    "required": ["primary_strategy", "theory_practice_ratio", "assessment_types", "key_patterns"],
    "properties": {
      "primary_strategy": {
        "type": "string",
        "enum": ["problem-based learning", "lecture-based", "inquiry-based", "project-based", "mixed"],
        "description": "Primary pedagogical strategy observed in source materials"
      },
      "theory_practice_ratio": {
        "type": "string",
        "pattern": "^\\d{1,2}:\\d{1,2}$",
        "description": "Ratio of theory to practice (e.g., '30:70', '50:50')",
        "examples": ["30:70", "50:50", "70:30"]
      },
      "assessment_types": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["coding", "quizzes", "projects", "essays", "presentations", "peer-review"]
        },
        "minItems": 1,
        "maxItems": 5,
        "description": "Types of assessments to include"
      },
      "key_patterns": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "minItems": 1,
        "maxItems": 5,
        "description": "Observed pedagogical patterns (e.g., 'build incrementally', 'learn by refactoring')",
        "examples": [
          "build incrementally",
          "learn by refactoring",
          "worked examples then practice",
          "discovery learning with scaffolding"
        ]
      }
    }
  }
}
```

**Impact**: +10% Generation quality (maintains pedagogical consistency)
**RT-002 Reference**: Section 5.1 "Schema Enhancements Required"

---

### 1.2 Enhance `scope_instructions` → `generation_guidance`

**Why**: Generation needs specific constraints (analogies, jargon, visuals), not just free-text prompt

**Current State**: `scope_instructions` is unstructured string (100-800 chars)
**Enhancement**: Replace with structured object

**Schema Replacement**:
```json
{
  "generation_guidance": {
    "type": "object",
    "required": ["tone", "use_analogies", "avoid_jargon", "include_visuals", "exercise_types"],
    "properties": {
      "tone": {
        "type": "string",
        "enum": ["conversational but precise", "formal academic", "casual friendly", "technical professional"],
        "description": "Tone to use in lesson content"
      },
      "use_analogies": {
        "type": "boolean",
        "description": "Whether to use analogies and metaphors"
      },
      "specific_analogies": {
        "type": ["array", "null"],
        "items": {
          "type": "string"
        },
        "description": "Specific analogies from source materials to use",
        "examples": [["assembly line for data flow", "kitchen recipe for algorithms"]]
      },
      "avoid_jargon": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Terms to avoid or explain",
        "examples": [["stochastic", "ergodic", "homomorphism"]]
      },
      "include_visuals": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["diagrams", "flowcharts", "code examples", "screenshots", "animations", "plots"]
        },
        "minItems": 1,
        "description": "Types of visuals to include"
      },
      "exercise_types": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["coding", "derivation", "interpretation", "debugging", "refactoring", "analysis"]
        },
        "minItems": 1,
        "description": "Types of exercises to create"
      },
      "contextual_language_hints": {
        "type": "string",
        "minLength": 50,
        "maxLength": 300,
        "description": "Audience assumptions (e.g., 'Assume familiarity with matrix operations but not neural networks')"
      },
      "real_world_examples": {
        "type": ["array", "null"],
        "items": {
          "type": "string"
        },
        "description": "Real-world applications to reference",
        "examples": [["Image recognition in smartphones", "Spam email detection"]]
      }
    }
  }
}
```

**Migration**: Keep `scope_instructions` as deprecated field for backward compatibility, populate both

**Impact**: +15% Generation quality (better constraint adherence, clearer guidance)
**RT-002 Reference**: Section 3.1 "Analyze Provides Structure and Guidance"

---

### 1.3 Enhance `sections_breakdown` Fields

**Why**: Generation needs section IDs, duration, difficulty, prerequisites for dependency graph

**Current State**: sections_breakdown has area, estimated_lessons, importance, etc.
**Enhancement**: Add 4 new fields

**Schema Addition** (to SectionBreakdown definition):
```json
{
  "SectionBreakdown": {
    "properties": {
      // EXISTING FIELDS (keep as-is):
      "area": {...},
      "estimated_lessons": {...},
      "importance": {...},
      "learning_objectives": {...},
      "key_topics": {...},
      "pedagogical_approach": {...},
      "difficulty_progression": {...},

      // NEW FIELDS (add these):
      "section_id": {
        "type": "string",
        "pattern": "^[1-9]\\d*$",
        "description": "Unique section identifier (1, 2, 3, ...) for references",
        "examples": ["1", "2", "3"]
      },
      "estimated_duration_hours": {
        "type": "number",
        "minimum": 0.5,
        "maximum": 20,
        "description": "Estimated learning time for this section in hours"
      },
      "difficulty": {
        "type": "string",
        "enum": ["beginner", "intermediate", "advanced"],
        "description": "Overall difficulty level of this section"
      },
      "prerequisites": {
        "type": "array",
        "items": {
          "type": "string",
          "pattern": "^[1-9]\\d*$"
        },
        "description": "Array of section_ids that must be completed before this section (empty if none)",
        "examples": [[], ["1"], ["1", "2"]]
      }
    },
    "required": [
      // EXISTING (keep):
      "area", "estimated_lessons", "importance", "learning_objectives",
      "key_topics", "pedagogical_approach", "difficulty_progression",
      // NEW (add):
      "section_id", "estimated_duration_hours", "difficulty", "prerequisites"
    ]
  }
}
```

**Impact**: +10% Generation quality (better dependency handling, adaptive pacing)
**RT-002 Reference**: Section 5.1 "Schema Enhancements Required"

---

## Priority 2: SHOULD ADD (Nice-to-Have)

### 2.1 Add `document_analysis` Top-Level Field

**Why**: Provides Generation with document-level context it can't infer from section breakdown

**Current State**: No document-level metadata (only section-level)
**Enhancement**: Add new top-level field

**Schema Addition**:
```json
{
  "document_analysis": {
    "type": "object",
    "required": ["source_materials", "main_themes", "complexity_assessment", "estimated_total_hours"],
    "properties": {
      "source_materials": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "IDs of source documents analyzed (file_ids from file_catalog)",
        "examples": [["file_123", "file_456"]]
      },
      "main_themes": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["theme", "importance", "coverage"],
          "properties": {
            "theme": {
              "type": "string",
              "description": "Major theme from documents"
            },
            "importance": {
              "type": "string",
              "enum": ["high", "medium", "low"]
            },
            "coverage": {
              "type": "string",
              "description": "Where this theme appears (e.g., 'chapters 1-3', 'throughout')"
            }
          }
        },
        "minItems": 1,
        "maxItems": 5,
        "description": "Main themes detected across documents"
      },
      "complexity_assessment": {
        "type": "string",
        "minLength": 50,
        "maxLength": 200,
        "description": "Overall complexity assessment (e.g., 'advanced undergraduate', 'professional level')"
      },
      "estimated_total_hours": {
        "type": "number",
        "minimum": 0.5,
        "maximum": 200,
        "description": "Total estimated learning time (sum of all sections)"
      },
      "concept_graph": {
        "type": ["object", "null"],
        "description": "Optional concept relationship graph (complex to implement, low ROI for MVP)",
        "properties": {
          "nodes": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["id", "label"],
              "properties": {
                "id": {"type": "string"},
                "label": {"type": "string"}
              }
            }
          },
          "relationships": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["from", "to", "type"],
              "properties": {
                "from": {"type": "string"},
                "to": {"type": "string"},
                "type": {"type": "string", "enum": ["prerequisite", "related", "extends"]}
              }
            }
          }
        }
      }
    }
  }
}
```

**Impact**: +5% Generation quality (better coherence, context awareness)
**RT-002 Reference**: Section 5.1 "Schema Enhancements Required" (document_analysis)

---

## Implementation Plan

### Phase 1: Critical Enhancements (MUST DO before Production)

**Tasks**:
1. Add `pedagogical_patterns` field to schema
2. Replace `scope_instructions` with `generation_guidance` (keep scope_instructions deprecated)
3. Enhance `sections_breakdown` with section_id, duration, difficulty, prerequisites

**Estimated Effort**: 2-3 days
- Update schema: 2 hours
- Update Analyze prompts: 4 hours
- Update Analyze validation: 2 hours
- Test with 10 sample courses: 4 hours
- Update Stage 5 Generation to consume new fields: 4 hours

**Testing Strategy**:
- Run Analyze on 10 courses with new schema
- Verify Generation quality improvement (A/B test)
- Ensure backward compatibility (scope_instructions still works)

**Success Criteria**:
- All 10 test courses generate valid new schema
- Generation quality improves by ≥10% (semantic similarity)
- No breaking changes to existing Generation code

---

### Phase 2: Optional Enhancements (SHOULD DO after MVP)

**Tasks**:
1. Add `document_analysis` field (without concept_graph)

**Estimated Effort**: 1 day
- Update schema: 1 hour
- Update Analyze prompts: 2 hours
- Update validation: 1 hour
- Test: 2 hours

**Testing Strategy**:
- Run Analyze on 5 courses with document_analysis
- Verify Generation uses document context
- Measure quality improvement

**Success Criteria**:
- Generation quality improves by ≥5% with document_analysis
- Document themes visible in lesson content

---

### Phase 3: Future Enhancements (MAY DO later)

**Tasks**:
1. Add `concept_graph` to document_analysis

**Estimated Effort**: 3-5 days (complex)
**ROI**: Low (marginal quality improvement)
**Recommendation**: Skip unless A/B testing shows significant benefit

---

## Migration Strategy

### Backward Compatibility

**Requirement**: Stage 5 Generation MUST work with both old and new schema

**Implementation**:
1. Keep `scope_instructions` field (populate from `generation_guidance` if new schema)
2. Make new fields optional (defaults if missing)
3. Version analysis_result with `metadata.analysis_version`

**Code Example** (Generation reads schema):
```typescript
// In metadata-generator.ts or section-batch-generator.ts
const guidance = input.analysis_result.generation_guidance || {
  tone: 'conversational but precise',
  use_analogies: true,
  avoid_jargon: [],
  include_visuals: ['diagrams', 'code examples'],
  exercise_types: ['coding'],
  contextual_language_hints: input.analysis_result.scope_instructions || ''
};

const patterns = input.analysis_result.pedagogical_patterns || {
  primary_strategy: 'mixed',
  theory_practice_ratio: '50:50',
  assessment_types: ['coding'],
  key_patterns: []
};
```

**Result**: Generation works with old Analyze output, but gets better results with new schema

---

## Validation

### Before Implementation

**Questions to Answer**:
1. Does current Analyze output limit Generation quality? → YES (10-15% improvement possible)
2. Can Generation work without these enhancements? → YES (MVP functional)
3. Is backward compatibility possible? → YES (optional fields + defaults)

**Decision**: Implement Phase 1 (critical enhancements) before Production, Phase 2 after MVP validation

---

### After Implementation

**Metrics to Track**:
1. Generation quality (semantic similarity) - expect +10-15% improvement
2. Lesson objective alignment - expect +10% improvement
3. Pedagogical consistency - expect +15% improvement
4. Analyze processing time - should stay <10s (no regression)
5. Analyze cost - should stay <$0.50 per course (no regression)

**A/B Test**:
- Generate 20 courses with old schema
- Generate 20 courses with new schema
- Compare quality metrics
- If improvement <10%, revisit schema design

---

## References

**RT-002 Research**:
- Quick reference: `specs/008-generation-generation-json/research-decisions/rt-002-architecture-balance.md`
- Full analysis: `specs/008-generation-generation-json/research-decisions/rt-002-full-analysis.md`
- Schema section: Section 5.1 "Schema Enhancements Required"

**Current Schema**:
- Location: `specs/007-stage-4-analyze/contracts/analysis-result.schema.json`

**Research Findings**:
- Division of Labor: Analyze section-level, Generation lesson-level
- Over-specification: Reduces quality by 15-30% (provide constraints, not instructions)
- Pedagogical patterns: Theory/practice balance affects lesson design
- Generation guidance: Structured constraints better than free-text

---

## Conclusion

**Current Analyze Schema**: ✅ FUNCTIONAL but ⚠️ SUBOPTIMAL

**Recommendation**:
1. **Phase 1** (MUST DO): Add pedagogical_patterns, generation_guidance, sections_breakdown enhancements
2. **Phase 2** (SHOULD DO): Add document_analysis
3. **Phase 3** (MAY DO): Add concept_graph (skip unless proven benefit)

**Timeline**:
- Phase 1: Before Production (2-3 days effort)
- Phase 2: After MVP validation (1 day effort)
- Phase 3: Future (if needed)

**Expected Impact**: +10-15% Generation quality improvement with Phase 1, +5% with Phase 2

---

**Status**: ⏭️ PENDING - Implement after Stage 5 MVP complete
**Owner**: TBD (Analyze team + Generation team collaboration)
**Created**: 2025-11-07
**Last Updated**: 2025-11-07
