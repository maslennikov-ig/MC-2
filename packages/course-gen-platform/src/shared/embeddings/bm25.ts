/**
 * Production-Quality BM25 Implementation with IDF
 *
 * Full BM25 (Okapi BM25) implementation for sparse vector generation:
 * - Term Frequency (TF) calculation
 * - Inverse Document Frequency (IDF) calculation
 * - Corpus statistics tracking (document count, term frequencies, avg doc length)
 * - Sparse vector generation for Qdrant
 *
 * BM25 Formula:
 * score(D, Q) = Σ IDF(qi) · (f(qi, D) · (k1 + 1)) / (f(qi, D) + k1 · (1 - b + b · |D| / avgdl))
 *
 * Where:
 * - D: document
 * - Q: query
 * - f(qi, D): term frequency of qi in D
 * - |D|: length of document D in words
 * - avgdl: average document length in the collection
 * - k1: term saturation parameter (default: 1.5)
 * - b: length normalization parameter (default: 0.75)
 * - IDF(qi): inverse document frequency of term qi
 *
 * @module shared/embeddings/bm25
 * @see https://en.wikipedia.org/wiki/Okapi_BM25
 */

/**
 * BM25 parameters (standard values from research)
 */
export interface BM25Parameters {
  /** Term saturation parameter (default: 1.5) */
  k1: number;
  /** Length normalization parameter (default: 0.75) */
  b: number;
}

/**
 * Corpus statistics for IDF calculation
 */
export interface CorpusStatistics {
  /** Total number of documents in corpus */
  total_documents: number;
  /** Map of term to number of documents containing it */
  document_frequencies: Map<string, number>;
  /** Average document length in tokens */
  average_document_length: number;
  /** Total tokens across all documents */
  total_tokens: number;
}

/**
 * Sparse vector representation
 */
export interface SparseVector {
  /** Term indices (hashed term positions) */
  indices: number[];
  /** BM25 scores for each term */
  values: number[];
}

/**
 * Tokenization options
 */
export interface TokenizationOptions {
  /** Convert to lowercase (default: true) */
  lowercase: boolean;
  /** Minimum token length (default: 2) */
  min_token_length: number;
  /** Remove stop words (default: false) */
  remove_stopwords: boolean;
  /** Stop words list (if remove_stopwords is true) */
  stopwords?: Set<string>;
}

/**
 * Default BM25 parameters (standard values)
 */
export const DEFAULT_BM25_PARAMS: BM25Parameters = {
  k1: 1.5,
  b: 0.75,
};

/**
 * Default tokenization options (with stopwords enabled for better BM25)
 */
export const DEFAULT_TOKENIZATION_OPTIONS: TokenizationOptions = {
  lowercase: true,
  min_token_length: 2,
  remove_stopwords: true,
  stopwords: undefined, // Will be set to COMBINED_STOPWORDS after it's defined
};

/**
 * Common English stop words (basic set)
 */
export const ENGLISH_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'that',
  'the',
  'to',
  'was',
  'will',
  'with',
]);

/**
 * Common Russian stop words (basic set)
 */
export const RUSSIAN_STOPWORDS = new Set([
  'и',
  'в',
  'во',
  'не',
  'что',
  'он',
  'на',
  'я',
  'с',
  'со',
  'как',
  'а',
  'то',
  'все',
  'она',
  'так',
  'его',
  'но',
  'да',
  'ты',
  'к',
  'у',
  'же',
  'вы',
  'за',
  'бы',
  'по',
  'только',
  'её',
  'мне',
  'было',
  'вот',
  'от',
  'меня',
  'ещё',
  'нет',
  'о',
  'из',
  'ему',
  'теперь',
  'когда',
  'уже',
  'вам',
  'ни',
  'быть',
  'был',
  'была',
  'были',
  'мы',
  'это',
  'эта',
  'эти',
  'этот',
  'который',
]);

/**
 * Combined English + Russian stop words
 */
export const COMBINED_STOPWORDS = new Set([...ENGLISH_STOPWORDS, ...RUSSIAN_STOPWORDS]);

// Set the default stopwords after COMBINED_STOPWORDS is defined
DEFAULT_TOKENIZATION_OPTIONS.stopwords = COMBINED_STOPWORDS;

/**
 * BM25 Scorer with corpus statistics tracking
 */
export class BM25Scorer {
  private params: BM25Parameters;
  private corpusStats: CorpusStatistics;
  private tokenizationOptions: TokenizationOptions;

  /**
   * Initialize BM25 scorer with parameters
   *
   * @param params - BM25 parameters (k1, b)
   * @param tokenizationOptions - Tokenization options
   */
  constructor(
    params: BM25Parameters = DEFAULT_BM25_PARAMS,
    tokenizationOptions: TokenizationOptions = DEFAULT_TOKENIZATION_OPTIONS
  ) {
    this.params = params;
    this.tokenizationOptions = tokenizationOptions;
    this.corpusStats = {
      total_documents: 0,
      document_frequencies: new Map(),
      average_document_length: 0,
      total_tokens: 0,
    };
  }

  /**
   * Tokenizes text into terms
   *
   * Supports both Cyrillic (Russian) and Latin text with proper normalization.
   *
   * @param text - Input text
   * @returns Array of tokens
   */
  private tokenize(text: string): string[] {
    // Normalize text: lowercase and normalize ё→е (commonly interchanged in Russian)
    let normalizedText = text;
    if (this.tokenizationOptions.lowercase) {
      normalizedText = text.toLowerCase().replace(/ё/g, 'е');
    }

    // Extract words using regex that supports both Cyrillic and Latin
    // This properly handles Russian text without splitting on Cyrillic punctuation issues
    const matches = normalizedText.match(/[a-zа-яё0-9]+/gi);
    let tokens: string[] = matches ? [...matches] : [];

    // Filter by minimum length
    tokens = tokens.filter(t => t.length >= this.tokenizationOptions.min_token_length);

    // Remove stop words (supports both English and Russian)
    if (this.tokenizationOptions.remove_stopwords && this.tokenizationOptions.stopwords) {
      tokens = tokens.filter(t => !this.tokenizationOptions.stopwords!.has(t));
    }

    return tokens;
  }

  /**
   * Hashes a term to a numeric index (for sparse vector representation)
   *
   * @param term - Term string
   * @returns Numeric index (0-99999)
   */
  private hashTerm(term: string): number {
    let hash = 0;
    for (let i = 0; i < term.length; i++) {
      hash = (hash << 5) - hash + term.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % 100000; // Map to 100k vocabulary space
  }

  /**
   * Adds documents to corpus statistics
   *
   * This must be called before generating BM25 scores to build the corpus statistics.
   *
   * @param documents - Array of document texts
   */
  public addDocuments(documents: string[]): void {
    this.corpusStats.total_documents += documents.length;

    let totalTokens = 0;

    documents.forEach(doc => {
      const tokens = this.tokenize(doc);
      totalTokens += tokens.length;

      // Track unique terms in this document
      const uniqueTerms = new Set(tokens);

      uniqueTerms.forEach(term => {
        const currentCount = this.corpusStats.document_frequencies.get(term) || 0;
        this.corpusStats.document_frequencies.set(term, currentCount + 1);
      });
    });

    this.corpusStats.total_tokens += totalTokens;
    this.corpusStats.average_document_length =
      this.corpusStats.total_tokens / this.corpusStats.total_documents;
  }

  /**
   * Calculates IDF (Inverse Document Frequency) for a term
   *
   * IDF(t) = log((N - df(t) + 0.5) / (df(t) + 0.5) + 1)
   *
   * Where:
   * - N: total number of documents
   * - df(t): number of documents containing term t
   *
   * @param term - Term
   * @returns IDF score
   */
  private calculateIDF(term: string): number {
    const N = this.corpusStats.total_documents;
    const df = this.corpusStats.document_frequencies.get(term) || 0;

    // BM25 IDF formula (with smoothing)
    return Math.log((N - df + 0.5) / (df + 0.5) + 1);
  }

  /**
   * Generates BM25 sparse vector from text
   *
   * @param text - Input text
   * @returns Sparse vector (indices and BM25 scores)
   */
  public generateSparseVector(text: string): SparseVector {
    const tokens = this.tokenize(text);

    // Calculate term frequencies
    const termFrequencies = new Map<string, number>();
    tokens.forEach(term => {
      termFrequencies.set(term, (termFrequencies.get(term) || 0) + 1);
    });

    const docLength = tokens.length;
    const avgDocLength = this.corpusStats.average_document_length || 100; // Fallback if no corpus

    // Use a map to handle hash collisions and ensure unique indices
    // If multiple terms hash to the same index, sum their BM25 scores
    const indexScoreMap = new Map<number, number>();

    // Calculate BM25 score for each unique term
    termFrequencies.forEach((tf, term) => {
      const termIndex = this.hashTerm(term);

      // Calculate IDF
      const idf = this.calculateIDF(term);

      // Calculate BM25 score
      // BM25 = IDF(t) · (f(t, D) · (k1 + 1)) / (f(t, D) + k1 · (1 - b + b · |D| / avgdl))
      const numerator = tf * (this.params.k1 + 1);
      const denominator =
        tf + this.params.k1 * (1 - this.params.b + this.params.b * (docLength / avgDocLength));

      const bm25Score = idf * (numerator / denominator);

      // Sum scores for indices that have hash collisions
      const currentScore = indexScoreMap.get(termIndex) || 0;
      indexScoreMap.set(termIndex, currentScore + bm25Score);
    });

    // Convert map to arrays (now guaranteed to have unique indices)
    const indices: number[] = Array.from(indexScoreMap.keys());
    const values: number[] = Array.from(indexScoreMap.values());

    return { indices, values };
  }

  /**
   * Generates sparse vectors for a batch of texts
   *
   * @param texts - Array of input texts
   * @returns Array of sparse vectors
   */
  public generateSparseVectorsBatch(texts: string[]): SparseVector[] {
    return texts.map(text => this.generateSparseVector(text));
  }

  /**
   * Gets corpus statistics
   *
   * @returns Current corpus statistics
   */
  public getCorpusStats(): CorpusStatistics {
    return {
      total_documents: this.corpusStats.total_documents,
      document_frequencies: new Map(this.corpusStats.document_frequencies),
      average_document_length: this.corpusStats.average_document_length,
      total_tokens: this.corpusStats.total_tokens,
    };
  }

  /**
   * Resets corpus statistics
   */
  public resetCorpus(): void {
    this.corpusStats = {
      total_documents: 0,
      document_frequencies: new Map(),
      average_document_length: 0,
      total_tokens: 0,
    };
  }

  /**
   * Loads corpus statistics from JSON
   *
   * @param stats - Corpus statistics object
   */
  public loadCorpusStats(stats: {
    total_documents: number;
    document_frequencies: Record<string, number>;
    average_document_length: number;
    total_tokens: number;
  }): void {
    this.corpusStats = {
      total_documents: stats.total_documents,
      document_frequencies: new Map(Object.entries(stats.document_frequencies)),
      average_document_length: stats.average_document_length,
      total_tokens: stats.total_tokens,
    };
  }

  /**
   * Exports corpus statistics to JSON
   *
   * @returns Corpus statistics as plain object
   */
  public exportCorpusStats(): {
    total_documents: number;
    document_frequencies: Record<string, number>;
    average_document_length: number;
    total_tokens: number;
  } {
    return {
      total_documents: this.corpusStats.total_documents,
      document_frequencies: Object.fromEntries(this.corpusStats.document_frequencies),
      average_document_length: this.corpusStats.average_document_length,
      total_tokens: this.corpusStats.total_tokens,
    };
  }
}

/**
 * Creates a global BM25 scorer instance (singleton pattern)
 */
let globalBM25Scorer: BM25Scorer | null = null;

/**
 * Gets or creates the global BM25 scorer instance
 *
 * @param params - BM25 parameters (optional)
 * @param tokenizationOptions - Tokenization options (optional)
 * @returns Global BM25 scorer instance
 */
export function getGlobalBM25Scorer(
  params?: BM25Parameters,
  tokenizationOptions?: TokenizationOptions
): BM25Scorer {
  if (!globalBM25Scorer) {
    globalBM25Scorer = new BM25Scorer(params, tokenizationOptions);
  }
  return globalBM25Scorer;
}

/**
 * Resets the global BM25 scorer (for testing)
 */
export function resetGlobalBM25Scorer(): void {
  globalBM25Scorer = null;
}
