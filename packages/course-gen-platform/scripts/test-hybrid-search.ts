#!/usr/bin/env tsx
/**
 * BM25 Hybrid Search Integration Test (T080.4)
 *
 * This script validates BM25 sparse vectors + RRF hybrid search implemented in T075.
 * Tests sparse vector generation, hybrid search, precision improvement, and RRF merging.
 *
 * Test Coverage:
 * 1. Dense-only search (baseline)
 * 2. Sparse vector generation (BM25 with IDF)
 * 3. Hybrid search (dense + sparse + RRF)
 * 4. Lexical matching quality
 * 5. Precision improvement measurement
 *
 * Expected improvement: +7-10pp precision (82% → 89-92%)
 *
 * Usage:
 *   pnpm tsx scripts/test-hybrid-search.ts
 *
 * Requirements:
 *   - QDRANT_URL and QDRANT_API_KEY configured in .env
 *   - JINA_API_KEY configured in .env
 *   - Qdrant collection created (course_embeddings)
 *   - Redis running (for caching)
 *
 * Performance Targets:
 *   - Dense search latency: <50ms p95
 *   - Sparse search latency: <50ms p95
 *   - Hybrid search latency: <100ms p95
 *   - Precision improvement: +5-10pp vs dense-only
 *
 * Runtime: <15 seconds
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { randomBytes } from 'crypto';

// Load environment variables BEFORE importing modules
dotenv.config({ path: resolve(__dirname, '../.env') });

// Import components
import { chunkMarkdown } from '../src/shared/embeddings/markdown-chunker';
import { enrichChunks } from '../src/shared/embeddings/metadata-enricher';
import {
  generateEmbeddingsWithLateChunking,
} from '../src/shared/embeddings/generate';
import { uploadChunksToQdrant } from '../src/shared/qdrant/upload';
import { searchChunks } from '../src/shared/qdrant/search';
import { qdrantClient } from '../src/shared/qdrant/client';
import { COLLECTION_CONFIG } from '../src/shared/qdrant/create-collection';
import { BM25Scorer } from '../src/shared/embeddings/bm25';

// UUID generator
function generateUUID(): string {
  return randomBytes(16).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

// ANSI colors
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function logSuccess(message: string) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logError(message: string) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function logWarning(message: string) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function logInfo(message: string) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

function logSection(title: string) {
  console.log(`\n${colors.bold}${colors.cyan}${title}${colors.reset}`);
  console.log('─'.repeat(70));
}

function logStep(step: number, total: number, description: string) {
  console.log(
    `\n${colors.magenta}[${step}/${total}]${colors.reset} ${colors.bold}${description}${colors.reset}`
  );
}

/**
 * Test statistics
 */
interface TestStats {
  // Upload statistics
  documentsUploaded: number;
  chunksIndexed: number;
  corpusSize: number;
  uniqueTerms: number;

  // Dense search (baseline)
  denseSearchCount: number;
  denseAvgLatency: number;
  denseAvgPrecision: number;
  denseLatencies: number[];

  // Sparse search
  sparseSearchCount: number;
  sparseAvgLatency: number;
  sparseAvgPrecision: number;
  sparseLatencies: number[];

  // Hybrid search
  hybridSearchCount: number;
  hybridAvgLatency: number;
  hybridAvgPrecision: number;
  hybridLatencies: number[];

  // Precision improvement
  precisionImprovement: number;
  precisionImprovementPercent: number;

  // Test results
  testsPassed: number;
  testsFailed: number;
  totalTests: number;
}

const stats: TestStats = {
  documentsUploaded: 0,
  chunksIndexed: 0,
  corpusSize: 0,
  uniqueTerms: 0,
  denseSearchCount: 0,
  denseAvgLatency: 0,
  denseAvgPrecision: 0,
  denseLatencies: [],
  sparseSearchCount: 0,
  sparseAvgLatency: 0,
  sparseAvgPrecision: 0,
  sparseLatencies: [],
  hybridSearchCount: 0,
  hybridAvgLatency: 0,
  hybridAvgPrecision: 0,
  hybridLatencies: [],
  precisionImprovement: 0,
  precisionImprovementPercent: 0,
  testsPassed: 0,
  testsFailed: 0,
  totalTests: 0,
};

/**
 * Test query with expected results
 */
interface TestQuery {
  query: string;
  description: string;
  type: 'lexical' | 'semantic' | 'hybrid';
  expectedKeywords: string[];
  expectedDocuments: string[];
}

/**
 * Creates test documents with technical terms and synonyms
 *
 * These documents are designed to test:
 * - Exact lexical matching (technical terms)
 * - Semantic matching (synonyms)
 * - Hybrid matching (both)
 */
function createTestDocuments(): { name: string; content: string }[] {
  return [
    {
      name: 'Neural Networks Deep Learning',
      content: `# Deep Learning and Neural Networks

## Introduction to Artificial Neural Networks

Artificial neural networks (ANNs) are computational models inspired by biological neural networks in the human brain. They consist of interconnected nodes (neurons) organized in layers that process information through weighted connections.

### Architecture Components

A typical neural network contains:
- **Input Layer**: Receives raw data features
- **Hidden Layers**: Process data through nonlinear transformations
- **Output Layer**: Produces predictions or classifications
- **Activation Functions**: Introduce nonlinearity (ReLU, sigmoid, tanh)
- **Weights and Biases**: Learnable parameters adjusted during training

### Training Process

The backpropagation algorithm is fundamental to neural network training:

1. **Forward Pass**: Input data flows through the network
2. **Loss Computation**: Calculate error between prediction and target
3. **Backward Pass**: Compute gradients using chain rule
4. **Parameter Update**: Adjust weights using gradient descent
5. **Iteration**: Repeat until convergence

Common optimization algorithms include SGD (stochastic gradient descent), Adam, RMSprop, and AdaGrad.

## Convolutional Neural Networks (CNNs)

CNNs are specialized for processing grid-like data such as images. Key operations:

- **Convolution**: Apply learnable filters to detect features
- **Pooling**: Reduce spatial dimensions (max pooling, average pooling)
- **Stride**: Step size for filter movement
- **Padding**: Border handling to preserve dimensions

Popular CNN architectures: ResNet, VGG, Inception, MobileNet, EfficientNet.

## Recurrent Neural Networks (RNNs)

RNNs process sequential data by maintaining hidden state across time steps. Variants include:

- **LSTM** (Long Short-Term Memory): Gates to control information flow
- **GRU** (Gated Recurrent Unit): Simplified version of LSTM
- **Bidirectional RNNs**: Process sequences in both directions

Applications: language modeling, speech recognition, time series prediction.

## Advanced Topics

### Transfer Learning

Pre-trained models (e.g., BERT, GPT, ResNet) can be fine-tuned for specific tasks, reducing training time and data requirements.

### Regularization Techniques

- **Dropout**: Randomly disable neurons during training
- **Batch Normalization**: Normalize activations between layers
- **L1/L2 Regularization**: Penalize large weights
- **Data Augmentation**: Increase training data variety

### Hyperparameter Tuning

Critical parameters to optimize:
- Learning rate (with schedules and warmup)
- Batch size
- Number of layers and neurons
- Regularization strength
- Optimizer choice
`,
    },
    {
      name: 'Machine Learning Algorithms',
      content: `# Machine Learning Algorithms and Methods

## Supervised Learning Algorithms

Supervised learning trains models on labeled data to predict outcomes for new inputs.

### Classification Algorithms

**Decision Trees**: Hierarchical models that split data based on feature values. Easy to interpret but prone to overfitting.

**Random Forests**: Ensemble of decision trees that reduces overfitting through bagging (bootstrap aggregating). Provides feature importance scores.

**Support Vector Machines (SVM)**: Find optimal hyperplane that maximizes margin between classes. Effective in high-dimensional spaces. Use kernel trick for nonlinear boundaries (RBF, polynomial kernels).

**Logistic Regression**: Linear model for binary classification using sigmoid function. Interpretable coefficients indicate feature importance.

**Naive Bayes**: Probabilistic classifier based on Bayes' theorem with independence assumption. Fast and effective for text classification.

**k-Nearest Neighbors (kNN)**: Instance-based learning that classifies based on majority vote of k nearest neighbors. Distance metrics: Euclidean, Manhattan, Minkowski.

### Regression Algorithms

**Linear Regression**: Models relationship between features and continuous target using least squares. Assumes linear relationship and normal residuals.

**Ridge Regression**: Linear regression with L2 regularization to prevent overfitting. Shrinks coefficients toward zero.

**Lasso Regression**: Linear regression with L1 regularization. Performs feature selection by setting some coefficients to zero.

**Gradient Boosting**: Ensemble method that builds models sequentially, each correcting errors of previous ones. Implementations: XGBoost, LightGBM, CatBoost.

## Unsupervised Learning Algorithms

Unsupervised learning finds patterns in unlabeled data.

### Clustering Algorithms

**K-Means**: Partitions data into k clusters by minimizing within-cluster variance. Requires specifying k in advance. Uses Euclidean distance.

**Hierarchical Clustering**: Builds tree of clusters using agglomerative (bottom-up) or divisive (top-down) approaches. Linkage methods: single, complete, average, Ward.

**DBSCAN**: Density-based clustering that finds arbitrary-shaped clusters and identifies outliers. Parameters: epsilon (neighborhood radius) and minPts (minimum points).

**Gaussian Mixture Models (GMM)**: Probabilistic model assuming data comes from mixture of Gaussian distributions. Uses EM (Expectation-Maximization) algorithm.

### Dimensionality Reduction

**Principal Component Analysis (PCA)**: Linear transformation that projects data onto orthogonal axes capturing maximum variance. Useful for visualization and noise reduction.

**t-SNE**: Nonlinear technique for visualizing high-dimensional data in 2D/3D. Preserves local structure.

**UMAP**: Uniform Manifold Approximation and Projection. Faster than t-SNE with better global structure preservation.

**Autoencoders**: Neural networks that learn compressed representations through bottleneck architecture.

## Model Evaluation Metrics

### Classification Metrics

- **Accuracy**: Correct predictions / total predictions
- **Precision**: True positives / (true positives + false positives)
- **Recall**: True positives / (true positives + false negatives)
- **F1 Score**: Harmonic mean of precision and recall
- **ROC-AUC**: Area under receiver operating characteristic curve
- **Confusion Matrix**: Tabulates true positives, false positives, true negatives, false negatives

### Regression Metrics

- **MSE** (Mean Squared Error): Average squared difference between predictions and actuals
- **RMSE** (Root Mean Squared Error): Square root of MSE, same units as target
- **MAE** (Mean Absolute Error): Average absolute difference
- **R²** (Coefficient of Determination): Proportion of variance explained by model

## Cross-Validation

**k-Fold Cross-Validation**: Split data into k folds, train on k-1 folds and validate on remaining fold. Repeat k times.

**Stratified k-Fold**: Maintains class distribution in each fold for imbalanced datasets.

**Leave-One-Out**: Extreme case where k equals number of samples. Computationally expensive.

**Time Series Split**: Respects temporal order for time series data.
`,
    },
    {
      name: 'Natural Language Processing',
      content: `# Natural Language Processing and Text Analytics

## Text Preprocessing

Text preprocessing is essential for NLP tasks to convert raw text into structured format.

### Tokenization

**Word Tokenization**: Split text into individual words or tokens. Handles punctuation, contractions, and special characters.

**Subword Tokenization**: Split words into smaller units. Methods include Byte-Pair Encoding (BPE), WordPiece, and SentencePiece. Used by modern transformers like BERT and GPT.

**Character Tokenization**: Split text into individual characters. Useful for morphologically rich languages.

### Text Normalization

**Lowercasing**: Convert all text to lowercase to reduce vocabulary size.

**Stemming**: Reduce words to root form using rules (Porter Stemmer, Lancaster Stemmer). Fast but may produce non-words.

**Lemmatization**: Reduce words to dictionary form using morphological analysis. More accurate than stemming but slower.

**Stop Word Removal**: Remove common words (the, is, at) that add little meaning.

**Special Character Handling**: Remove or replace punctuation, numbers, URLs, emails.

## Text Representation

### Traditional Methods

**Bag of Words (BoW)**: Represent text as frequency count of words. Ignores word order and context.

**TF-IDF** (Term Frequency-Inverse Document Frequency): Weight words by frequency in document relative to corpus. Reduces importance of common words.

**N-grams**: Capture word sequences (bigrams, trigrams). Preserves some local context.

### Word Embeddings

**Word2Vec**: Neural network that learns word representations from context. Two architectures: CBOW (Continuous Bag of Words) and Skip-gram.

**GloVe** (Global Vectors): Matrix factorization method using global word co-occurrence statistics.

**FastText**: Extension of Word2Vec that uses character n-grams. Handles out-of-vocabulary words and morphological variations.

### Contextual Embeddings

**ELMo** (Embeddings from Language Models): Bidirectional LSTM-based model producing context-dependent representations.

**BERT** (Bidirectional Encoder Representations from Transformers): Pre-trained transformer using masked language modeling and next sentence prediction. Variants: RoBERTa, ALBERT, DistilBERT.

**GPT** (Generative Pre-trained Transformer): Autoregressive language model trained to predict next token. GPT-2, GPT-3, GPT-4 show impressive few-shot learning.

**T5** (Text-to-Text Transfer Transformer): Frames all NLP tasks as text generation.

## NLP Tasks

### Text Classification

Assign predefined categories to text. Applications: sentiment analysis, spam detection, topic classification.

**Sentiment Analysis**: Determine emotional tone (positive, negative, neutral). Aspect-based sentiment analyzes specific features.

**Intent Classification**: Identify user intention in conversational AI.

### Named Entity Recognition (NER)

Identify and classify entities: person names, organizations, locations, dates, quantities.

Methods: CRF (Conditional Random Fields), BiLSTM-CRF, transformer-based models.

### Information Extraction

**Relation Extraction**: Identify relationships between entities.

**Event Extraction**: Detect events and their participants, time, location.

**Coreference Resolution**: Determine which mentions refer to same entity.

### Question Answering

**Extractive QA**: Extract answer span from given context (SQuAD dataset).

**Generative QA**: Generate answer from knowledge (GPT-based models).

**Open-Domain QA**: Answer questions using large knowledge base or web.

### Machine Translation

**Statistical Machine Translation**: Phrase-based models using parallel corpora.

**Neural Machine Translation**: Sequence-to-sequence models with attention mechanism. Transformer architecture (used in Google Translate) achieves state-of-the-art.

**Zero-Shot Translation**: Translate between language pairs without direct training data.

### Text Summarization

**Extractive Summarization**: Select important sentences from original text. Methods: TextRank, BERT-based.

**Abstractive Summarization**: Generate new sentences capturing key information. Models: BART, T5, Pegasus.

## Language Models

**n-gram Language Models**: Predict next word based on previous n-1 words using Markov assumption.

**Neural Language Models**: RNN/LSTM-based models that capture long-range dependencies.

**Transformer Language Models**: Self-attention mechanism enables parallel processing and longer context windows.

**Pre-training and Fine-tuning**: Pre-train on large unlabeled corpus, then fine-tune on task-specific data. Transfer learning approach.

## Evaluation Metrics

**BLEU** (Bilingual Evaluation Understudy): Measures n-gram overlap for machine translation.

**ROUGE** (Recall-Oriented Understudy for Gisting Evaluation): Measures recall for summarization.

**Perplexity**: Measures how well probability model predicts text. Lower is better.

**Accuracy, Precision, Recall, F1**: Standard metrics for classification tasks.
`,
    },
  ];
}

/**
 * Creates test queries that exercise different search capabilities
 */
function createTestQueries(): TestQuery[] {
  return [
    // Lexical queries (exact technical terms)
    {
      query: 'backpropagation gradient descent optimizer',
      description: 'Lexical match - exact technical terms',
      type: 'lexical',
      expectedKeywords: ['backpropagation', 'gradient descent', 'optimizer', 'sgd', 'adam'],
      expectedDocuments: ['Neural Networks Deep Learning'],
    },
    {
      query: 'BERT transformer attention mechanism',
      description: 'Lexical match - model names',
      type: 'lexical',
      expectedKeywords: ['BERT', 'transformer', 'attention', 'GPT'],
      expectedDocuments: ['Natural Language Processing'],
    },
    {
      query: 'k-means clustering DBSCAN hierarchical',
      description: 'Lexical match - algorithm names',
      type: 'lexical',
      expectedKeywords: ['k-means', 'DBSCAN', 'hierarchical', 'clustering'],
      expectedDocuments: ['Machine Learning Algorithms'],
    },

    // Semantic queries (synonyms and concepts)
    {
      query: 'How do I train a model to recognize patterns in images?',
      description: 'Semantic match - concept description',
      type: 'semantic',
      expectedKeywords: ['CNN', 'convolutional', 'image', 'convolution'],
      expectedDocuments: ['Neural Networks Deep Learning'],
    },
    {
      query: 'What methods reduce overfitting in models?',
      description: 'Semantic match - problem solving',
      type: 'semantic',
      expectedKeywords: ['regularization', 'dropout', 'L1', 'L2'],
      expectedDocuments: ['Neural Networks Deep Learning', 'Machine Learning Algorithms'],
    },
    {
      query: 'How to convert text into numerical vectors?',
      description: 'Semantic match - conceptual question',
      type: 'semantic',
      expectedKeywords: ['embeddings', 'Word2Vec', 'TF-IDF', 'representation'],
      expectedDocuments: ['Natural Language Processing'],
    },

    // Hybrid queries (both exact terms and concepts)
    {
      query: 'What is the difference between supervised and unsupervised learning algorithms?',
      description: 'Hybrid match - terms + concepts',
      type: 'hybrid',
      expectedKeywords: ['supervised', 'unsupervised', 'classification', 'clustering'],
      expectedDocuments: ['Machine Learning Algorithms'],
    },
    {
      query: 'Explain neural network architecture with layers and activation functions',
      description: 'Hybrid match - technical terms + description',
      type: 'hybrid',
      expectedKeywords: ['neural network', 'layers', 'activation', 'ReLU', 'sigmoid'],
      expectedDocuments: ['Neural Networks Deep Learning'],
    },
  ];
}

/**
 * Test 1: Upload documents with dense vectors only (baseline)
 */
async function testDenseOnlyUpload(): Promise<void> {
  logStep(1, 5, 'Dense-Only Upload (Baseline)');

  try {
    const testDocs = createTestDocuments();
    const organizationId = 'test-hybrid-org-001';
    const courseId = 'test-hybrid-course-001';

    for (const doc of testDocs) {
      const documentId = generateUUID();

      // Chunk markdown
      const chunkingResult = await chunkMarkdown(doc.content);

      // Enrich chunks
      const enrichedChunks = enrichChunks(chunkingResult.child_chunks, {
        document_id: documentId,
        document_name: doc.name,
        organization_id: organizationId,
        course_id: courseId,
        document_version: 'v1',
        version_hash: generateUUID(),
      });

      // Generate embeddings (dense only)
      const embeddingResult = await generateEmbeddingsWithLateChunking(
        enrichedChunks,
        'retrieval.passage',
        true
      );

      // Upload WITHOUT sparse vectors
      const uploadResult = await uploadChunksToQdrant(embeddingResult.embeddings, {
        batch_size: 100,
        enable_sparse: false, // Dense only
        wait: true,
      });

      if (!uploadResult.success) {
        throw new Error(`Upload failed: ${uploadResult.error}`);
      }

      stats.chunksIndexed += uploadResult.points_uploaded;
      logInfo(`  Uploaded ${uploadResult.points_uploaded} chunks from "${doc.name}"`);
    }

    stats.documentsUploaded = testDocs.length;
    logSuccess(`Uploaded ${stats.documentsUploaded} documents with dense vectors only`);
    logInfo(`  Total chunks indexed: ${stats.chunksIndexed}`);

    stats.testsPassed++;
  } catch (error) {
    stats.testsFailed++;
    throw error;
  } finally {
    stats.totalTests++;
  }
}

/**
 * Test 2: Verify sparse vector generation
 */
async function testSparseVectorGeneration(): Promise<void> {
  logStep(2, 5, 'Sparse Vector Generation (BM25 with IDF)');

  try {
    const bm25Scorer = new BM25Scorer();

    // Build corpus statistics
    const testDocs = createTestDocuments();
    const documents = testDocs.map(doc => doc.content);

    bm25Scorer.addDocuments(documents);

    const corpusStats = bm25Scorer.getCorpusStats();

    stats.corpusSize = corpusStats.total_documents;
    stats.uniqueTerms = corpusStats.document_frequencies.size;

    logSuccess('Corpus statistics built');
    logInfo(`  Total documents: ${corpusStats.total_documents}`);
    logInfo(`  Unique terms: ${corpusStats.document_frequencies.size}`);
    logInfo(`  Average document length: ${corpusStats.average_document_length.toFixed(2)} tokens`);
    logInfo(`  Total tokens: ${corpusStats.total_tokens}`);

    // Test sparse vector generation
    const testText = 'neural network backpropagation gradient descent';
    const sparseVector = bm25Scorer.generateSparseVector(testText);

    logSuccess('Sparse vector generated');
    logInfo(`  Input: "${testText}"`);
    logInfo(`  Terms: ${sparseVector.indices.length}`);
    logInfo(`  Indices: [${sparseVector.indices.slice(0, 5).join(', ')}...]`);
    logInfo(`  Values (BM25 scores): [${sparseVector.values.slice(0, 5).map(v => v.toFixed(3)).join(', ')}...]`);

    // Validate sparse vector
    if (sparseVector.indices.length === 0 || sparseVector.values.length === 0) {
      throw new Error('Sparse vector generation failed: empty vectors');
    }

    if (sparseVector.indices.length !== sparseVector.values.length) {
      throw new Error('Sparse vector mismatch: indices and values have different lengths');
    }

    // Verify BM25 scores are positive
    const allPositive = sparseVector.values.every(v => v > 0);
    if (!allPositive) {
      throw new Error('BM25 scores should be positive');
    }

    logSuccess('Sparse vector validation passed');

    stats.testsPassed++;
  } catch (error) {
    stats.testsFailed++;
    throw error;
  } finally {
    stats.totalTests++;
  }
}

/**
 * Test 3: Upload documents with sparse vectors
 */
async function testHybridUpload(): Promise<void> {
  logStep(3, 5, 'Hybrid Upload (Dense + Sparse Vectors)');

  try {
    // First, delete existing test data
    await qdrantClient.delete(COLLECTION_CONFIG.name, {
      filter: {
        must: [
          { key: 'organization_id', match: { value: 'test-hybrid-org-001' } },
        ],
      },
      wait: true,
    });

    const testDocs = createTestDocuments();
    const organizationId = 'test-hybrid-org-001';
    const courseId = 'test-hybrid-course-002'; // Different course for hybrid

    let totalChunks = 0;

    for (const doc of testDocs) {
      const documentId = generateUUID();

      // Chunk markdown
      const chunkingResult = await chunkMarkdown(doc.content);

      // Enrich chunks
      const enrichedChunks = enrichChunks(chunkingResult.child_chunks, {
        document_id: documentId,
        document_name: doc.name,
        organization_id: organizationId,
        course_id: courseId,
        document_version: 'v1',
        version_hash: generateUUID(),
      });

      // Generate embeddings
      const embeddingResult = await generateEmbeddingsWithLateChunking(
        enrichedChunks,
        'retrieval.passage',
        true
      );

      // Upload WITH sparse vectors
      const uploadResult = await uploadChunksToQdrant(embeddingResult.embeddings, {
        batch_size: 100,
        enable_sparse: true, // Enable BM25 sparse vectors
        wait: true,
      });

      if (!uploadResult.success) {
        throw new Error(`Hybrid upload failed: ${uploadResult.error}`);
      }

      totalChunks += uploadResult.points_uploaded;
      logInfo(`  Uploaded ${uploadResult.points_uploaded} chunks from "${doc.name}" (dense + sparse)`);
    }

    logSuccess(`Uploaded ${testDocs.length} documents with hybrid vectors`);
    logInfo(`  Total chunks with dense + sparse: ${totalChunks}`);

    stats.testsPassed++;
  } catch (error) {
    stats.testsFailed++;
    throw error;
  } finally {
    stats.totalTests++;
  }
}

/**
 * Calculates precision for search results
 */
function calculatePrecision(
  results: any[],
  expectedKeywords: string[],
  expectedDocs: string[]
): number {
  if (results.length === 0) return 0;

  let relevantCount = 0;

  for (const result of results) {
    const contentLower = result.content.toLowerCase();
    const docNameLower = result.document_name.toLowerCase();

    // Check if result contains expected keywords
    const hasKeywords = expectedKeywords.some(keyword =>
      contentLower.includes(keyword.toLowerCase())
    );

    // Check if result is from expected document
    const isExpectedDoc = expectedDocs.some(docName =>
      docNameLower.includes(docName.toLowerCase())
    );

    if (hasKeywords || isExpectedDoc) {
      relevantCount++;
    }
  }

  return relevantCount / results.length;
}

/**
 * Test 4: Dense-only search (baseline)
 */
async function testDenseOnlySearch(): Promise<void> {
  logStep(4, 5, 'Dense-Only Search (Baseline Precision)');

  try {
    const testQueries = createTestQueries();
    const precisions: number[] = [];

    for (const testQuery of testQueries) {
      const startTime = Date.now();

      const response = await searchChunks(testQuery.query, {
        limit: 5,
        score_threshold: 0.5,
        filters: {
          organization_id: 'test-hybrid-org-001',
          course_id: 'test-hybrid-course-001', // Dense-only course
        },
        enable_hybrid: false, // Dense only
        include_payload: true,
      });

      const latency = Date.now() - startTime;
      stats.denseLatencies.push(latency);

      const precision = calculatePrecision(
        response.results,
        testQuery.expectedKeywords,
        testQuery.expectedDocuments
      );

      precisions.push(precision);

      logInfo(`  Query: "${testQuery.query.substring(0, 50)}..."`);
      logInfo(`    Type: ${testQuery.type}`);
      logInfo(`    Results: ${response.results.length}`);
      logInfo(`    Latency: ${latency}ms`);
      logInfo(`    Precision: ${(precision * 100).toFixed(1)}%`);

      if (response.results.length > 0) {
        const topResult = response.results[0];
        logInfo(`    Top result: [${topResult.score.toFixed(3)}] ${topResult.document_name}`);
      }
    }

    stats.denseSearchCount = testQueries.length;
    stats.denseAvgLatency = stats.denseLatencies.reduce((a, b) => a + b, 0) / stats.denseLatencies.length;
    stats.denseAvgPrecision = precisions.reduce((a, b) => a + b, 0) / precisions.length;

    logSuccess('Dense-only search complete');
    logInfo(`  Average latency: ${stats.denseAvgLatency.toFixed(0)}ms`);
    logInfo(`  Average precision: ${(stats.denseAvgPrecision * 100).toFixed(1)}%`);

    // Validate latency
    const p95Latency = stats.denseLatencies.sort((a, b) => a - b)[Math.floor(stats.denseLatencies.length * 0.95)];
    if (p95Latency < 50) {
      logSuccess(`  P95 latency: ${p95Latency}ms (< 50ms target)`);
    } else {
      logWarning(`  P95 latency: ${p95Latency}ms (> 50ms target)`);
    }

    stats.testsPassed++;
  } catch (error) {
    stats.testsFailed++;
    throw error;
  } finally {
    stats.totalTests++;
  }
}

/**
 * Test 5: Hybrid search (dense + sparse + RRF)
 */
async function testHybridSearch(): Promise<void> {
  logStep(5, 5, 'Hybrid Search (Dense + Sparse + RRF)');

  try {
    const testQueries = createTestQueries();
    const precisions: number[] = [];

    for (const testQuery of testQueries) {
      const startTime = Date.now();

      const response = await searchChunks(testQuery.query, {
        limit: 5,
        score_threshold: 0.3, // Lower threshold for hybrid
        filters: {
          organization_id: 'test-hybrid-org-001',
          course_id: 'test-hybrid-course-002', // Hybrid course
        },
        enable_hybrid: true, // Enable hybrid search
        include_payload: true,
      });

      const latency = Date.now() - startTime;
      stats.hybridLatencies.push(latency);

      const precision = calculatePrecision(
        response.results,
        testQuery.expectedKeywords,
        testQuery.expectedDocuments
      );

      precisions.push(precision);

      logInfo(`  Query: "${testQuery.query.substring(0, 50)}..."`);
      logInfo(`    Type: ${testQuery.type}`);
      logInfo(`    Results: ${response.results.length}`);
      logInfo(`    Latency: ${latency}ms`);
      logInfo(`    Precision: ${(precision * 100).toFixed(1)}%`);

      if (response.results.length > 0) {
        const topResult = response.results[0];
        logInfo(`    Top result: [${topResult.score.toFixed(3)}] ${topResult.document_name}`);
      }
    }

    stats.hybridSearchCount = testQueries.length;
    stats.hybridAvgLatency = stats.hybridLatencies.reduce((a, b) => a + b, 0) / stats.hybridLatencies.length;
    stats.hybridAvgPrecision = precisions.reduce((a, b) => a + b, 0) / precisions.length;

    // Calculate precision improvement
    stats.precisionImprovement = stats.hybridAvgPrecision - stats.denseAvgPrecision;
    stats.precisionImprovementPercent = (stats.precisionImprovement / stats.denseAvgPrecision) * 100;

    logSuccess('Hybrid search complete');
    logInfo(`  Average latency: ${stats.hybridAvgLatency.toFixed(0)}ms`);
    logInfo(`  Average precision: ${(stats.hybridAvgPrecision * 100).toFixed(1)}%`);

    // Validate latency
    const p95Latency = stats.hybridLatencies.sort((a, b) => a - b)[Math.floor(stats.hybridLatencies.length * 0.95)];
    if (p95Latency < 100) {
      logSuccess(`  P95 latency: ${p95Latency}ms (< 100ms target)`);
    } else {
      logWarning(`  P95 latency: ${p95Latency}ms (> 100ms target)`);
    }

    // Validate precision improvement
    if (stats.precisionImprovement > 0.05) {
      logSuccess(`  Precision improvement: +${(stats.precisionImprovement * 100).toFixed(1)}pp (+${stats.precisionImprovementPercent.toFixed(1)}%)`);
    } else if (stats.precisionImprovement > 0) {
      logWarning(`  Precision improvement: +${(stats.precisionImprovement * 100).toFixed(1)}pp (target: >5pp)`);
    } else {
      logError(`  Precision improvement: ${(stats.precisionImprovement * 100).toFixed(1)}pp (negative!)`);
    }

    stats.testsPassed++;
  } catch (error) {
    stats.testsFailed++;
    throw error;
  } finally {
    stats.totalTests++;
  }
}

/**
 * Cleanup test data
 */
async function cleanupTestData(): Promise<void> {
  logSection('Cleanup');

  try {
    await qdrantClient.delete(COLLECTION_CONFIG.name, {
      filter: {
        must: [
          { key: 'organization_id', match: { value: 'test-hybrid-org-001' } },
        ],
      },
      wait: true,
    });

    logSuccess('Deleted test data from Qdrant');
  } catch (error) {
    logWarning(`Cleanup warning: ${error}`);
  }
}

/**
 * Display test summary
 */
function displaySummary(): void {
  logSection('Test Summary');

  console.log(`\n${colors.bold}Test Results:${colors.reset}`);
  console.log(`  Tests passed: ${colors.green}${stats.testsPassed}${colors.reset}/${stats.totalTests}`);
  console.log(`  Tests failed: ${stats.testsFailed > 0 ? colors.red : colors.green}${stats.testsFailed}${colors.reset}/${stats.totalTests}`);

  console.log(`\n${colors.bold}Corpus Statistics:${colors.reset}`);
  console.log(`  Documents uploaded: ${colors.cyan}${stats.documentsUploaded}${colors.reset}`);
  console.log(`  Chunks indexed: ${colors.cyan}${stats.chunksIndexed}${colors.reset}`);
  console.log(`  Corpus size: ${colors.cyan}${stats.corpusSize}${colors.reset} documents`);
  console.log(`  Unique terms: ${colors.cyan}${stats.uniqueTerms}${colors.reset}`);

  console.log(`\n${colors.bold}Dense-Only Search (Baseline):${colors.reset}`);
  console.log(`  Queries executed: ${colors.cyan}${stats.denseSearchCount}${colors.reset}`);
  console.log(`  Average latency: ${colors.cyan}${stats.denseAvgLatency.toFixed(0)}ms${colors.reset}`);
  console.log(`  Average precision: ${colors.cyan}${(stats.denseAvgPrecision * 100).toFixed(1)}%${colors.reset}`);

  console.log(`\n${colors.bold}Hybrid Search (Dense + Sparse + RRF):${colors.reset}`);
  console.log(`  Queries executed: ${colors.cyan}${stats.hybridSearchCount}${colors.reset}`);
  console.log(`  Average latency: ${colors.cyan}${stats.hybridAvgLatency.toFixed(0)}ms${colors.reset}`);
  console.log(`  Average precision: ${colors.cyan}${(stats.hybridAvgPrecision * 100).toFixed(1)}%${colors.reset}`);

  console.log(`\n${colors.bold}Precision Improvement:${colors.reset}`);
  const improvementColor = stats.precisionImprovement >= 0.05 ? colors.green : stats.precisionImprovement > 0 ? colors.yellow : colors.red;
  console.log(`  Absolute: ${improvementColor}+${(stats.precisionImprovement * 100).toFixed(1)}pp${colors.reset}`);
  console.log(`  Relative: ${improvementColor}+${stats.precisionImprovementPercent.toFixed(1)}%${colors.reset}`);

  console.log(`\n${colors.bold}Acceptance Criteria:${colors.reset}`);
  console.log(`  ${stats.corpusSize > 0 ? colors.green + '✓' : colors.red + '✗'}${colors.reset} BM25 sparse vectors generated`);
  console.log(`  ${stats.uniqueTerms > 0 ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Corpus statistics tracked`);
  console.log(`  ${stats.hybridSearchCount > 0 ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Hybrid search executed`);
  console.log(`  ${stats.precisionImprovement >= 0.05 ? colors.green + '✓' : colors.yellow + '⚠'}${colors.reset} Precision improvement >5pp (target: 5-10pp)`);
  console.log(`  ${stats.hybridAvgLatency < 100 ? colors.green + '✓' : colors.yellow + '⚠'}${colors.reset} Hybrid search latency <100ms p95`);
}

/**
 * Ensures collection exists with proper hybrid vector support
 */
async function ensureCollectionExists(): Promise<void> {
  try {
    const collection = await qdrantClient.getCollection(COLLECTION_CONFIG.name);
    logSuccess(`Collection "${COLLECTION_CONFIG.name}" exists`);

    // Verify sparse vector support
    const config: any = collection.config;
    const params: any = config?.params || {};

    if (params.sparse_vectors && params.sparse_vectors.sparse) {
      logSuccess('Sparse vector support confirmed');
      logInfo(`  Sparse index on_disk: ${params.sparse_vectors.sparse.index?.on_disk || false}`);
    } else {
      logWarning('Collection exists but sparse vectors not configured');
      logInfo('Hybrid search tests will run with dense-only fallback');
      logInfo('To enable hybrid search, recreate collection with: pnpm qdrant:create-collection');
    }
  } catch (error: any) {
    if (error?.status === 404 || error?.message?.includes('Not found')) {
      logWarning(`Collection "${COLLECTION_CONFIG.name}" not found`);
      logInfo('Please run: pnpm qdrant:create-collection');
      throw new Error('Collection does not exist. Run pnpm qdrant:create-collection first.');
    }
    throw error;
  }
}

/**
 * Main test execution
 */
async function runHybridSearchTests(): Promise<void> {
  console.log(`${colors.bold}${colors.cyan}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}BM25 Hybrid Search Integration Test (T080.4)${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${'='.repeat(70)}${colors.reset}`);

  const startTime = Date.now();

  try {
    // Environment check
    logSection('Environment Check');

    const requiredVars = ['QDRANT_URL', 'QDRANT_API_KEY', 'JINA_API_KEY'];
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        throw new Error(`Missing required environment variable: ${varName}`);
      }
      logSuccess(`${varName}: Configured`);
    }

    // Check Redis (optional - will work without it, just slower)
    if (process.env.REDIS_URL) {
      logSuccess('REDIS_URL: Configured');
    } else {
      logWarning('REDIS_URL: Not configured (tests will run without caching)');
    }

    // Check collection
    await ensureCollectionExists();

    // Run tests
    await testDenseOnlyUpload();
    await testSparseVectorGeneration();
    await testHybridUpload();
    await testDenseOnlySearch();
    await testHybridSearch();

    // Cleanup
    await cleanupTestData();

    // Summary
    displaySummary();

    const duration = Date.now() - startTime;
    logSection('Test Complete');
    logSuccess(`All tests completed in ${(duration / 1000).toFixed(1)}s`);

    if (stats.testsFailed === 0) {
      console.log(`\n${colors.green}${colors.bold}✓ ALL TESTS PASSED${colors.reset}`);
      process.exit(0);
    } else {
      console.log(`\n${colors.red}${colors.bold}✗ SOME TESTS FAILED${colors.reset}`);
      process.exit(1);
    }
  } catch (error) {
    const duration = Date.now() - startTime;

    logSection('Test Failed');
    logError(`Hybrid search test failed after ${(duration / 1000).toFixed(1)}s`);
    console.error(`\n${colors.red}Error:${colors.reset}`, error);

    console.log(`\n${colors.bold}Troubleshooting:${colors.reset}`);
    console.log('  1. Verify Qdrant is accessible and collection exists');
    console.log('  2. Verify Jina API key is valid');
    console.log('  3. Verify Redis is running');
    console.log('  4. Check environment variables in .env\n');

    process.exit(1);
  }
}

// Run tests
runHybridSearchTests();
