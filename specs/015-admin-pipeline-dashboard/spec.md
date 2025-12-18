# Feature Specification: Admin Pipeline Dashboard

**Feature Branch**: `015-admin-pipeline-dashboard`
**Created**: 2025-12-03
**Status**: Draft
**Input**: Admin page for managing course generation pipeline - view stages, configure LLM models, edit prompts, manage OpenRouter integration

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Pipeline Overview (Priority: P1)

As a superadmin, I need to see a visual overview of all 6 course generation pipeline stages so I can understand the current state of the system and identify any issues.

**Why this priority**: This is the foundational feature - without visibility into pipeline stages, admins cannot make informed decisions about model or prompt changes. Provides immediate operational value.

**Independent Test**: Can be fully tested by logging in as superadmin and viewing the pipeline overview page. Delivers immediate visibility into pipeline structure and statistics.

**Acceptance Scenarios**:

1. **Given** a superadmin is logged in, **When** they navigate to `/admin/pipeline`, **Then** they see all 6 pipeline stages displayed visually with stage names, descriptions, and status indicators
2. **Given** the pipeline overview is displayed, **When** the admin views statistics, **Then** they see total generations, success rate, total cost, and average completion time for a configurable period
3. **Given** any pipeline stage card is displayed, **When** the admin views it, **Then** they see which models and prompts are used, average execution time, and average cost for that stage

---

### User Story 2 - Configure LLM Models (Priority: P1)

As a superadmin, I need to view and edit LLM model configurations for each pipeline phase so I can optimize generation quality and costs.

**Why this priority**: Model configuration directly impacts generation quality and costs. Essential for tuning the system. Combined with P1 because it's the primary administrative action.

**Independent Test**: Can be fully tested by viewing the models tab and modifying a model configuration. Delivers ability to tune generation parameters.

**Acceptance Scenarios**:

1. **Given** a superadmin is on the Models tab, **When** they view the configuration table, **Then** they see all phases with current model, fallback model, temperature, max tokens, and last modified date
2. **Given** a model configuration is being edited, **When** the admin changes the model selection, **Then** they can search/filter available models from OpenRouter by provider, context size, and price
3. **Given** a model configuration is saved, **When** validation passes, **Then** a new version is created (not overwritten) and the change is logged to audit trail
4. **Given** a model configuration history exists, **When** the admin views history, **Then** they see all versions with dates, authors, and can revert to any previous version

---

### User Story 3 - Edit Prompt Templates (Priority: P2)

As a superadmin, I need to view and edit prompt templates used in the pipeline so I can refine generation quality without code changes.

**Why this priority**: Prompt editing is important but requires model configuration to be in place first. Provides significant operational flexibility.

**Independent Test**: Can be fully tested by viewing prompts grouped by stage and editing a prompt template. Delivers ability to refine prompts without deployments.

**Acceptance Scenarios**:

1. **Given** a superadmin is on the Prompts tab, **When** they view the prompt list, **Then** prompts are grouped by stage (3-6) showing name, description, version, and status
2. **Given** a prompt is selected for editing, **When** the admin opens the editor, **Then** they see a code editor with syntax highlighting, variable list, and preview capability
3. **Given** a prompt is saved, **When** the save completes, **Then** a new version is created and the previous version remains accessible for rollback
4. **Given** prompt templates are not found in database, **When** the system loads prompts, **Then** it falls back to hardcoded prompts in code

---

### User Story 4 - Manage Global Pipeline Settings (Priority: P2)

As a superadmin, I need to configure global pipeline settings and feature flags so I can control system behavior without code changes.

**Why this priority**: Settings management enables runtime control but is secondary to core model/prompt configuration.

**Independent Test**: Can be fully tested by viewing and modifying global settings. Delivers runtime configuration capability.

**Acceptance Scenarios**:

1. **Given** a superadmin is on the Settings tab, **When** they view global settings, **Then** they see RAG token budget, quality threshold, retry attempts, and timeout configurations
2. **Given** a superadmin views feature flags, **When** they toggle flags, **Then** they can enable/disable: database prompts, quality validation, and cost tracking
3. **Given** settings are modified, **When** saved, **Then** changes take effect for subsequent pipeline executions

---

### User Story 5 - Export/Import Configuration (Priority: P3)

As a superadmin, I need to export and import pipeline configurations so I can backup settings and transfer configurations between environments.

**Why this priority**: Export/import is valuable for disaster recovery and environment management but is not critical for day-to-day operations.

**Independent Test**: Can be fully tested by exporting configuration to JSON and importing it back. Delivers backup and environment transfer capability.

**Acceptance Scenarios**:

1. **Given** a superadmin clicks export, **When** the export completes, **Then** they receive a JSON file containing all model configs, prompts, and settings with metadata
2. **Given** a superadmin uploads a configuration JSON, **When** validation passes, **Then** they see a preview of changes before applying
3. **Given** an import is confirmed, **When** the import executes, **Then** a backup of current configuration is created first and changes are applied with rollback capability

---

### User Story 6 - Browse OpenRouter Models (Priority: P3)

As a superadmin, I need to browse available models from OpenRouter with detailed information so I can make informed model selection decisions.

**Why this priority**: Model browsing supports decision-making but is not critical - admins can use external OpenRouter documentation. Enhances usability.

**Independent Test**: Can be fully tested by viewing the model browser and filtering/searching models. Delivers convenient model discovery.

**Acceptance Scenarios**:

1. **Given** the model browser is displayed, **When** models are loaded, **Then** each model shows: ID, name, provider, context window, input/output pricing
2. **Given** the model list is displayed, **When** the admin applies filters, **Then** they can filter by provider, context size range, and price range
3. **Given** OpenRouter API is unavailable, **When** the admin views models, **Then** cached model data from the last successful fetch is displayed

---

### Edge Cases

- What happens when OpenRouter API is unavailable? System displays cached model data with a warning indicator.
- What happens when a prompt template in the database has invalid syntax? System falls back to hardcoded prompt and logs an error.
- What happens when a superadmin tries to delete the last active version of a configuration? System prevents deletion and displays an error message.
- What happens when two superadmins edit the same prompt simultaneously? Optimistic locking - second save shows conflict and offers to reload.
- What happens when import JSON schema is invalid? Validation fails with specific error messages, import is blocked.

## Requirements *(mandatory)*

### Functional Requirements

**Access Control**
- **FR-001**: System MUST restrict page access to users with superadmin role only
- **FR-002**: System MUST redirect unauthorized users to the main page
- **FR-003**: System MUST log all configuration changes to admin audit logs with user, timestamp, and change details

**Pipeline Overview**
- **FR-004**: System MUST display all 6 pipeline stages in a visual timeline/flowchart format
- **FR-005**: System MUST show for each stage: number, name, description, status, linked models, linked prompts, average execution time, average cost
- **FR-006**: System MUST display aggregate statistics: total generations, success/failure count, total cost, average completion time

**Model Configuration**
- **FR-007**: System MUST display all model configurations from database in a tabular format
- **FR-008**: System MUST allow editing: model selection, fallback model, temperature (0-2), max tokens
- **FR-009**: System MUST support 12 configuration phases: phase_1_classification, phase_2_scope, phase_3_expert, phase_4_synthesis, phase_6_rag_planning, emergency, quality_fallback, stage_3_classification, stage_5_metadata, stage_5_sections, stage_6_judge, stage_6_refinement
- **FR-010**: System MUST validate model existence in OpenRouter before saving configuration
- **FR-011**: System MUST create a new version when configuration is modified (unlimited version history retained)
- **FR-012**: System MUST allow reverting to any previous configuration version
- **FR-013**: System MUST allow resetting configuration to hardcoded default values

**OpenRouter Integration**
- **FR-014**: System MUST fetch available models from OpenRouter API
- **FR-015**: System MUST cache model list for 1 hour
- **FR-016**: System MUST display: model ID, name, provider, context window size, pricing per 1M tokens
- **FR-017**: System MUST support filtering models by provider, context size, and price

**Prompt Management**
- **FR-018**: System MUST store prompt templates in a database table with versioning
- **FR-019**: System MUST migrate 18 existing prompts from code to database (one-time seed)
- **FR-020**: System MUST display prompts grouped by stage (stage_3, stage_4, stage_5, stage_6)
- **FR-021**: System MUST provide a prompt editor with syntax highlighting for XML
- **FR-022**: System MUST show available template variables for each prompt
- **FR-023**: System MUST create a new version when prompt is modified (unlimited version history retained)
- **FR-024**: System MUST allow reverting to any previous prompt version
- **FR-025**: System MUST fall back to hardcoded prompts when database prompts are unavailable or disabled

**Global Settings**
- **FR-026**: System MUST allow configuring: RAG token budget, quality threshold, retry attempts per phase, timeout per phase
- **FR-027**: System MUST support feature flags: use_database_prompts, enable_quality_validation, enable_cost_tracking

**Export/Import**
- **FR-028**: System MUST export all configurations to a JSON file with metadata (version, date, author)
- **FR-029**: System MUST validate import JSON schema before applying changes
- **FR-030**: System MUST show preview of changes before import is applied
- **FR-031**: System MUST create automatic backup before applying import
- **FR-032**: System MUST support selective import (models only, prompts only, or all)
- **FR-033**: System MUST allow restoring from backup
- **FR-034**: System MUST retain only the last 20 backups (oldest deleted when limit exceeded)

### Key Entities

- **Pipeline Stage**: Represents one of 6 stages in course generation (number 1-6, name, description, handler reference)
- **Model Configuration**: Represents LLM settings for a specific phase (phase name, model ID, fallback model, temperature, max tokens, version, active status)
- **Prompt Template**: Represents an editable prompt (stage, key, name, description, template text, variables list, version, active status)
- **Configuration Backup**: Snapshot of all configurations at a point in time (backup data as JSON, creation metadata, backup type)
- **OpenRouter Model**: Cached representation of available LLM (model ID, name, provider, context length, pricing, capabilities)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Superadmins can access and navigate the pipeline dashboard within 2 seconds of page load
- **SC-002**: Model configuration changes take effect for the next pipeline execution without system restart
- **SC-003**: Prompt changes take effect for the next pipeline execution without code deployment
- **SC-004**: 100% of configuration changes are logged to audit trail with full change details
- **SC-005**: System continues operating with hardcoded fallbacks when database configurations are unavailable
- **SC-006**: Configuration export/import cycle completes without data loss (round-trip integrity)
- **SC-007**: OpenRouter model list loads from cache in under 500ms when API is slow or unavailable
- **SC-008**: 95% of superadmin configuration tasks complete successfully on first attempt

## Clarifications

### Session 2025-12-03

- Q: How many versions to retain for model configurations and prompt templates? → A: Keep unlimited versions
- Q: How long to retain configuration backups? → A: Keep last 20 backups

## Assumptions

- Superadmin users are technical and can understand LLM configuration parameters (temperature, tokens)
- OpenRouter API will remain available and backwards-compatible for model listing
- The existing admin layout and authentication infrastructure is stable
- Prompt templates use XML-based structure that can be validated syntactically
- The current 6-stage pipeline architecture is stable and unlikely to change significantly
- Audit log infrastructure already exists and can receive new event types
- Statistics data is available from existing generation_trace table
