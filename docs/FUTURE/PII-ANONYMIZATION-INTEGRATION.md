# PII Anonymization Integration for LLM Processing

**Status**: Planned (post-Stage 3 MVP)
**Related**: Stage 3 - Document Summarization
**External Project**: Anonymizer (separate project)

## Context

Stage 3 (Document Summarization) currently sends all document content to LLM APIs (OpenRouter) without PII filtering or redaction (Option A - No filtering approach). This is acceptable for MVP with user responsibility disclaimer, but poses privacy/compliance risks for production use with sensitive documents.

## Existing Solution

A separate **Anonymizer project** already exists that can anonymize sensitive data (PII, personal information, confidential content).

## Future Task

**Integrate Anonymizer project into Stage 3 summarization pipeline**:

1. **Pre-LLM processing**: Pass document content through Anonymizer before sending to OpenRouter
2. **Redaction strategy**: Define which PII types to redact (emails, phones, IDs, names, etc.)
3. **Summary post-processing**: Optionally de-anonymize summary output (if needed for course context)
4. **Organization-level controls**: Allow org admins to enable/disable anonymization per workspace
5. **Compliance**: Document GDPR/privacy compliance improvements

## Benefits

- **Privacy**: Protect user PII in documents sent to third-party LLM APIs
- **Compliance**: Meet GDPR and data protection requirements
- **Risk mitigation**: Reduce liability for sensitive content leakage
- **User trust**: Demonstrate commitment to data privacy

## Implementation Considerations

- Integration point: Between Stage 2 (text extraction) and Stage 3 (summarization)
- Performance impact: Anonymization adds latency (measure and optimize)
- Cost: Additional processing overhead (evaluate tier-based limits)
- Optional feature: May be org-tier-gated (PREMIUM feature)

## References

- Stage 3 Spec: `/home/me/code/megacampus2/specs/005-stage-3-create/spec.md`
- Clarification Session 2025-10-28: Security policy set to "No filtering" (Option A) for MVP
