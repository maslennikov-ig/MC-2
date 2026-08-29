/**
 * LLM Services Module
 * @module shared/llm
 *
 * Provides LLM integration services for the course generation platform:
 * - Model selection with language-aware routing (NEW)
 * - LLM client for OpenRouter API interactions
 * - Token estimation utilities
 * - Cost calculation for generation tracking
 * - LangChain model configuration
 * - Archetype-based parameter routing
 */

// Stage 4 context thresholds
export { STAGE4_CONTEXT_THRESHOLD, STAGE4_HARD_TOKEN_LIMIT } from './context-thresholds';

// LLM Client for OpenRouter
export { LLMClient, llmClient, type LLMClientOptions, type LLMResponse } from './client';

// Token Estimation
export { TokenEstimator, tokenEstimator } from './token-estimator';

// Cost Calculator
export {
  calculateGenerationCost,
  assessCostStatus,
  formatCost,
  getModelPricing,
  hasUnifiedPricing,
  estimateCost,
  estimateTokenCount,
  OPENROUTER_PRICING,
  COST_THRESHOLDS,
  type ModelPricing,
  type CostBreakdown,
  type CostStatus,
} from './cost-calculator';

// LangChain Model Configuration
export { createOpenRouterModel, getModelForPhase, getTextContent } from './langchain-models';

// LLM Parameters with Archetype Routing
export {
  getLLMParameters,
  getTemperatureForArchetype,
  getTemperatureRange,
  isTemperatureValid,
  getMaxRetries,
  ARCHETYPE_TEMPERATURE_RANGES,
  DEFAULT_LLM_PARAMETERS,
  RETRY_TEMPERATURE_INCREMENT,
  type LLMParameters,
  type TemperatureRange,
} from './llm-parameters';

// Context Overflow Handler
export {
  isContextOverflowError,
  getContextOverflowFallback,
  executeWithContextFallback,
  type ContextOverflowFallback,
  type ExecuteWithContextFallbackResult,
} from './context-overflow-handler';

// Model Config Bunker Types
export {
  type PhaseModelConfig,
  type ConfigMeta,
  type ActiveConfig,
  type ConfigSnapshot,
  type BunkerHealth,
} from './model-config-types';
