/**
 * Usage Examples: Stage 5 Cost Calculator
 *
 * This file demonstrates how to use the cost calculator service
 * for tracking generation costs with OpenRouter pricing.
 *
 * @module cost-calculator.example
 */

import {
  calculateGenerationCost,
  assessCostStatus,
  COST_THRESHOLDS,
  formatCost,
  getModelPricing,
  estimateCost,
  OPENROUTER_PRICING,
} from '../../../shared/llm/cost-calculator';
import type { GenerationMetadata } from '@megacampus/shared-types/generation-result';

// ============================================================================
// EXAMPLE 1: Calculate Cost from GenerationMetadata
// ============================================================================

function example1_calculateFromMetadata() {
  console.log('=== EXAMPLE 1: Calculate Cost from GenerationMetadata ===\n');

  // Typical generation metadata after Stage 5 pipeline completion
  const metadata: GenerationMetadata = {
    model_used: {
      metadata: 'qwen/qwen3-max',        // High-quality metadata generation
      sections: 'openai/gpt-oss-120b',   // Cost-effective section generation
      validation: 'google/gemini-2.5-flash', // Fast validation
    },
    total_tokens: {
      metadata: 5000,   // ~5K tokens for metadata generation
      sections: 45000,  // ~45K tokens for section batches
      validation: 2000, // ~2K tokens for validation
      total: 52000,
    },
    cost_usd: 0, // Will be calculated
    duration_ms: {
      metadata: 2000,
      sections: 8000,
      validation: 1000,
      total: 11000,
    },
    quality_scores: {
      metadata_similarity: 0.95,
      sections_similarity: [0.92, 0.93],
      overall: 0.93,
    },
    batch_count: 2,
    retry_count: {
      metadata: 0,
      sections: [0, 1], // One retry for batch 2
    },
    created_at: new Date().toISOString(),
  };

  // Calculate cost breakdown
  const cost = calculateGenerationCost(metadata);

  console.log('Cost Breakdown:');
  console.log(`  Metadata Cost:   ${formatCost(cost.metadata_cost_usd)}`);
  console.log(`  Sections Cost:   ${formatCost(cost.sections_cost_usd)}`);
  console.log(`  Validation Cost: ${formatCost(cost.validation_cost_usd)}`);
  console.log(`  Total Cost:      ${formatCost(cost.total_cost_usd)}`);
  console.log('\nToken Breakdown:');
  console.log(`  Metadata:   ${cost.token_breakdown.metadata_tokens.toLocaleString()} tokens`);
  console.log(`  Sections:   ${cost.token_breakdown.sections_tokens.toLocaleString()} tokens`);
  console.log(`  Validation: ${cost.token_breakdown.validation_tokens.toLocaleString()} tokens`);
  console.log(`  Total:      ${cost.token_breakdown.total_tokens.toLocaleString()} tokens`);
  console.log('\nModel Breakdown:');
  console.log(`  Metadata:   ${cost.model_breakdown.metadata_model}`);
  console.log(`  Sections:   ${cost.model_breakdown.sections_model}`);
  console.log(`  Validation: ${cost.model_breakdown.validation_model}`);

  // Assess cost status
  const status = assessCostStatus(cost.total_cost_usd);
  console.log(`\nCost Status: ${status.status}`);
  console.log(`Message: ${status.message}`);
  console.log('\n');
}

// ============================================================================
// EXAMPLE 2: Pre-Generation Cost Estimation
// ============================================================================

function example2_preGenerationEstimate() {
  console.log('=== EXAMPLE 2: Pre-Generation Cost Estimation ===\n');

  // Estimate cost before generation starts
  const estimatedMetadataTokens = 5000;
  const estimatedSectionsTokens = 50000;
  const estimatedValidationTokens = 3000;

  const metadataCost = estimateCost('qwen/qwen3-max', estimatedMetadataTokens, 0);
  const sectionsCost = estimateCost('openai/gpt-oss-120b', estimatedSectionsTokens, 0);
  const validationCost = estimateCost('google/gemini-2.5-flash', estimatedValidationTokens, 0);

  const totalEstimatedCost = metadataCost + sectionsCost + validationCost;

  console.log('Pre-Generation Cost Estimate:');
  console.log(`  Metadata:   ${formatCost(metadataCost)} (${estimatedMetadataTokens.toLocaleString()} tokens)`);
  console.log(`  Sections:   ${formatCost(sectionsCost)} (${estimatedSectionsTokens.toLocaleString()} tokens)`);
  console.log(`  Validation: ${formatCost(validationCost)} (${estimatedValidationTokens.toLocaleString()} tokens)`);
  console.log(`  Total:      ${formatCost(totalEstimatedCost)}`);

  // Check if within budget
  const status = assessCostStatus(totalEstimatedCost);
  console.log(`\nBudget Status: ${status.status}`);
  console.log(`Message: ${status.message}`);

  // Decision making
  if (status.status === 'EXCEEDS_LIMIT') {
    console.log('\n⚠️  RECOMMENDATION: Consider using cheaper models or reducing token usage');
  } else if (status.status === 'HIGH_COST_WARNING') {
    console.log('\n⚠️  RECOMMENDATION: Monitor closely, optimize if possible');
  } else {
    console.log('\n✅ RECOMMENDATION: Proceed with generation');
  }
  console.log('\n');
}

// ============================================================================
// EXAMPLE 3: Model Comparison
// ============================================================================

function example3_modelComparison() {
  console.log('=== EXAMPLE 3: Model Cost Comparison ===\n');

  const tokens = 50000; // 50K tokens for section generation

  console.log(`Cost comparison for ${tokens.toLocaleString()} tokens:\n`);

  // Compare different models
  const models = [
    'openai/gpt-oss-20b',
    'openai/gpt-oss-120b',
    'google/gemini-2.5-flash',
    'qwen/qwen3-max',
  ];

  models.forEach((model) => {
    const pricing = getModelPricing(model);
    if (pricing) {
      const cost = estimateCost(model, tokens, 0);
      const priceInfo = pricing.combinedPricePerMillion
        ? `$${pricing.combinedPricePerMillion}/1M (unified)`
        : `$${pricing.inputPricePerMillion}/$${pricing.outputPricePerMillion}/1M (split)`;
      console.log(`  ${model.padEnd(30)} ${formatCost(cost).padEnd(10)} (${priceInfo})`);
    }
  });

  console.log('\n💡 TIP: Use gpt-oss-20b for cost-effective section generation');
  console.log('💡 TIP: Use qwen3-max for high-quality metadata generation');
  console.log('💡 TIP: Use gemini-2.5-flash for fast, affordable validation\n');
}

// ============================================================================
// EXAMPLE 4: Cost Threshold Monitoring
// ============================================================================

function example4_thresholdMonitoring() {
  console.log('=== EXAMPLE 4: Cost Threshold Monitoring ===\n');

  console.log('RT-001/RT-004 Cost Thresholds:');
  console.log(`  Expected Min:       ${formatCost(COST_THRESHOLDS.EXPECTED_MIN)}`);
  console.log(`  Expected Max:       ${formatCost(COST_THRESHOLDS.EXPECTED_MAX)} ← Target range`);
  console.log(`  With Retries Max:   ${formatCost(COST_THRESHOLDS.WITH_RETRIES_MAX)} ← Acceptable with retries`);
  console.log(`  Hard Limit:         ${formatCost(COST_THRESHOLDS.HARD_LIMIT)} ← Maximum acceptable`);

  console.log('\nTest Scenarios:\n');

  const scenarios = [
    { cost: 0.35, description: 'Normal generation (no retries)' },
    { cost: 0.45, description: 'Generation with 1-2 retries' },
    { cost: 0.55, description: 'Generation with many retries' },
    { cost: 0.70, description: 'Excessive cost (needs optimization)' },
  ];

  scenarios.forEach(({ cost, description }) => {
    const status = assessCostStatus(cost);
    const icon = status.status === 'WITHIN_TARGET' ? '✅' :
                 status.status === 'ACCEPTABLE_WITH_RETRIES' ? '⚠️' :
                 status.status === 'HIGH_COST_WARNING' ? '⚠️⚠️' : '❌';
    console.log(`  ${icon} ${formatCost(cost).padEnd(10)} - ${description}`);
    console.log(`     Status: ${status.status}`);
  });
  console.log('\n');
}

// ============================================================================
// EXAMPLE 5: Pricing Data Inspection
// ============================================================================

function example5_pricingDataInspection() {
  console.log('=== EXAMPLE 5: OpenRouter Pricing Data ===\n');

  console.log('Available Models:\n');

  Object.entries(OPENROUTER_PRICING).forEach(([model, pricing]) => {
    console.log(`  ${model}`);
    if (pricing.combinedPricePerMillion) {
      console.log(`    - Unified Pricing: $${pricing.combinedPricePerMillion}/1M tokens`);
    } else {
      console.log(`    - Input:  $${pricing.inputPricePerMillion}/1M tokens`);
      console.log(`    - Output: $${pricing.outputPricePerMillion}/1M tokens`);
    }
  });

  console.log('\n💡 Pricing sourced from OpenRouter API (2025-11-10)');
  console.log('💡 To update pricing, modify OPENROUTER_PRICING in cost-calculator.ts\n');
}

// ============================================================================
// RUN EXAMPLES
// ============================================================================

// ESM compatible main module check
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/').split('/').pop() || '');
if (isMainModule) {
  example1_calculateFromMetadata();
  example2_preGenerationEstimate();
  example3_modelComparison();
  example4_thresholdMonitoring();
  example5_pricingDataInspection();
}
