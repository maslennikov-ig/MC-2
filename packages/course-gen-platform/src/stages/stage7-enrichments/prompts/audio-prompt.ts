/**
 * Audio TTS Preprocessing Module
 * @module stages/stage7-enrichments/prompts/audio-prompt
 *
 * Prepares lesson content for OpenAI TTS synthesis.
 * Handles markdown cleanup, text normalization, and chunking.
 *
 * This is NOT an LLM prompt template. It's a text preprocessing utility
 * that converts markdown lesson content to TTS-friendly plain text.
 *
 * OpenAI TTS constraints:
 * - Max input: 4096 characters per request
 * - Voices: alloy, ash, coral, echo, fable, nova, onyx, sage, shimmer
 * - Formats: mp3, opus, aac, flac, wav
 * - Speed: 0.25 to 4.0
 */

/**
 * OpenAI TTS voice options
 */
export type TTSVoice =
  | 'alloy'
  | 'ash'
  | 'coral'
  | 'echo'
  | 'fable'
  | 'nova'
  | 'onyx'
  | 'sage'
  | 'shimmer';

/**
 * OpenAI TTS output format options
 */
export type TTSFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav';

/**
 * Audio script generation settings
 */
export interface AudioScriptSettings {
  /** Voice for TTS synthesis */
  voice?: TTSVoice;

  /** Output format */
  format?: TTSFormat;

  /** Speed multiplier (0.25 to 4.0, default 1.0) */
  speed?: number;
}

/**
 * Parameters for audio script preprocessing
 */
export interface AudioScriptParams {
  /** Lesson title */
  lessonTitle: string;

  /** Lesson content (markdown) */
  lessonContent: string;

  /** Language code */
  language: 'ru' | 'en';

  /** Optional settings */
  settings?: AudioScriptSettings;
}

/**
 * Processed audio script ready for TTS
 */
export interface ProcessedAudioScript {
  /** Clean text ready for TTS */
  script: string;

  /** Estimated duration in seconds (150 wpm average) */
  estimatedDurationSeconds: number;

  /** Word count */
  wordCount: number;

  /** Character count */
  charCount: number;

  /** Chunk information (if text was split) */
  chunks?: string[];
}

/**
 * Convert markdown lesson content to TTS-friendly text
 *
 * Preprocessing steps:
 * 1. Remove markdown formatting (headers, bold, italic)
 * 2. Convert code blocks to descriptive text
 * 3. Handle lists, tables, headers appropriately
 * 4. Add natural pauses (periods/commas) where needed
 * 5. Calculate estimated duration
 *
 * @param params - Audio script generation parameters
 * @returns Processed audio script ready for TTS
 */
export function prepareAudioScript(params: AudioScriptParams): ProcessedAudioScript {
  const { lessonTitle, lessonContent, language, settings = {} } = params;
  const { speed = 1.0 } = settings;

  // Start with title as introduction
  let script = `${lessonTitle}.\n\n`;

  // Process the lesson content
  let processedContent = lessonContent;

  // 1. Remove image references first (before other regex patterns) ![alt](url)
  processedContent = processedContent.replace(/!\[([^\]]*)\]\([^)]+\)/g, (_match, alt) => {
    if (!alt) return '';
    if (language === 'ru') {
      return `Изображение: ${alt}.`;
    } else {
      return `Image: ${alt}.`;
    }
  });

  // 2. Remove code blocks and replace with descriptive text
  processedContent = processedContent.replace(/```[\s\S]*?```/g, (matchedBlock) => {
    // Extract language if present (e.g., ```typescript)
    const langMatch = matchedBlock.match(/```(\w+)/);
    const lang = langMatch ? langMatch[1] : '';

    if (language === 'ru') {
      return lang
        ? `Далее следует пример кода на языке ${lang}.`
        : 'Далее следует пример кода.';
    } else {
      return lang
        ? `The following code example is written in ${lang}.`
        : 'The following code example follows.';
    }
  });

  // 3. Remove inline code backticks (keep the text)
  processedContent = processedContent.replace(/`([^`]+)`/g, '$1');

  // 4. Remove markdown headers (# ## ###) - keep text, add period for pause
  processedContent = processedContent.replace(/^#{1,6}\s+(.+)$/gm, '$1.');

  // 5. Remove bold/italic formatting (**text** __text__ *text* _text_)
  processedContent = processedContent.replace(/(\*\*|__)(.*?)\1/g, '$2'); // Bold
  processedContent = processedContent.replace(/(\*|_)(.*?)\1/g, '$2'); // Italic

  // 6. Remove links but keep link text [text](url)
  processedContent = processedContent.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 7. Convert unordered lists to sentences with transitions
  processedContent = convertListsToSentences(processedContent, language);

  // 8. Convert tables to prose description
  processedContent = convertTablesToText(processedContent, language);

  // 9. Remove horizontal rules
  processedContent = processedContent.replace(/^[-*_]{3,}$/gm, '');

  // 10. Normalize whitespace
  processedContent = processedContent
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .replace(/[ \t]+/g, ' ') // Collapse spaces
    .trim();

  // 11. Add paragraph breaks as natural pauses (double newline becomes period + pause)
  processedContent = processedContent.replace(/\n\n/g, '.\n\n');

  // 12. Ensure sentences end with punctuation
  processedContent = processedContent.replace(/([^\.\!\?])\n/g, '$1.\n');

  // Combine title and content
  script += processedContent;

  // Calculate word count
  const wordCount = countWords(script);

  // Estimate duration (average 150 words per minute)
  const estimatedDurationSeconds = estimateAudioDuration(script, speed);

  // Get character count
  const charCount = script.length;

  // Check if chunking is needed (OpenAI TTS has 4096 char limit)
  const chunks = charCount > 4096 ? chunkAudioScript(script) : undefined;

  return {
    script,
    estimatedDurationSeconds,
    wordCount,
    charCount,
    chunks,
  };
}

/**
 * Convert markdown lists to natural sentences
 *
 * @param text - Text with markdown lists
 * @param language - Target language
 * @returns Text with lists converted to sentences
 */
function convertListsToSentences(text: string, language: 'ru' | 'en'): string {
  const transitions =
    language === 'ru'
      ? ['Во-первых', 'Во-вторых', 'В-третьих', 'Кроме того', 'Наконец']
      : ['First', 'Second', 'Third', 'Additionally', 'Finally'];

  let result = text;
  let transitionIndex = 0;

  // Match unordered lists (- item or * item)
  result = result.replace(/^[-*]\s+(.+)$/gm, (_match, item) => {
    const transition = transitions[transitionIndex % transitions.length];
    transitionIndex++;
    return `${transition}, ${item.charAt(0).toLowerCase()}${item.slice(1)}`;
  });

  // Match ordered lists (1. item)
  result = result.replace(/^\d+\.\s+(.+)$/gm, (_match, item) => {
    const transition = transitions[transitionIndex % transitions.length];
    transitionIndex++;
    return `${transition}, ${item.charAt(0).toLowerCase()}${item.slice(1)}`;
  });

  return result;
}

/**
 * Convert markdown tables to prose description
 *
 * @param text - Text with markdown tables
 * @param language - Target language
 * @returns Text with tables converted to prose
 */
function convertTablesToText(text: string, language: 'ru' | 'en'): string {
  // Match markdown tables (| header | header | ... with separator line)
  const tableRegex = /(\|.+\|[\r\n]+\|[-:\s|]+\|[\r\n]+(?:\|.+\|[\r\n]*)+)/g;

  return text.replace(tableRegex, () => {
    // Simple conversion: just remove the table and add a note
    if (language === 'ru') {
      return 'Далее представлена таблица с данными.';
    } else {
      return 'The following table shows the data.';
    }
  });
}

/**
 * Count words in text
 *
 * @param text - Text to count words in
 * @returns Word count
 */
function countWords(text: string): number {
  // Split on whitespace and filter out empty strings
  return text
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .length;
}

/**
 * Split long text into TTS-friendly chunks
 *
 * OpenAI TTS has input limit of 4096 characters.
 * We split at sentence boundaries to maintain natural flow.
 *
 * @param script - Full audio script
 * @param maxChunkSize - Maximum chunk size in characters (default: 4000, leaving margin)
 * @returns Array of text chunks
 */
export function chunkAudioScript(
  script: string,
  maxChunkSize: number = 4000
): string[] {
  const chunks: string[] = [];
  let currentChunk = '';

  // Split by sentences (. ! ?)
  const sentences = script.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    // If adding this sentence would exceed limit, save current chunk
    if (currentChunk.length + sentence.length + 1 > maxChunkSize) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      // If single sentence exceeds limit, split it forcefully
      if (sentence.length > maxChunkSize) {
        // Split long sentence at comma or space boundaries
        const parts = splitLongSentence(sentence, maxChunkSize);
        chunks.push(...parts.slice(0, -1));
        currentChunk = parts[parts.length - 1];
      } else {
        currentChunk = sentence;
      }
    } else {
      // Add sentence to current chunk
      currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence;
    }
  }

  // Add remaining chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Split a single long sentence into smaller parts
 *
 * @param sentence - Long sentence to split
 * @param maxSize - Maximum size per part
 * @returns Array of sentence parts
 */
function splitLongSentence(sentence: string, maxSize: number): string[] {
  const parts: string[] = [];
  let remaining = sentence;

  while (remaining.length > maxSize) {
    // Try to split at comma
    let splitIndex = remaining.lastIndexOf(',', maxSize);

    // If no comma, split at space
    if (splitIndex === -1) {
      splitIndex = remaining.lastIndexOf(' ', maxSize);
    }

    // If no space, force split at maxSize
    if (splitIndex === -1) {
      splitIndex = maxSize;
    }

    parts.push(remaining.substring(0, splitIndex + 1).trim());
    remaining = remaining.substring(splitIndex + 1).trim();
  }

  parts.push(remaining);
  return parts;
}

/**
 * Get default voice for language
 *
 * Recommended voices:
 * - English: 'nova' (clear, neutral, professional)
 * - Russian: 'nova' (works well for both languages)
 *
 * @param _language - Target language (currently unused, 'nova' works for both)
 * @returns Recommended TTS voice
 */
export function getDefaultVoice(_language: 'ru' | 'en'): TTSVoice {
  // Nova is a good default for both English and Russian
  // It has a clear, professional tone suitable for educational content
  return 'nova';
}

/**
 * Estimate audio duration from text
 *
 * Average speaking rate: ~150 words per minute (2.5 words/second)
 * Adjusted by speed multiplier.
 *
 * @param text - Text to be spoken
 * @param speed - Speed multiplier (0.25 to 4.0)
 * @returns Estimated duration in seconds
 */
export function estimateAudioDuration(text: string, speed: number = 1.0): number {
  const wordCount = countWords(text);

  // Average speaking rate: 150 words per minute = 2.5 words per second
  const wordsPerSecond = 2.5 * speed;

  // Calculate duration in seconds
  const durationSeconds = wordCount / wordsPerSecond;

  return Math.ceil(durationSeconds);
}

/**
 * Validate TTS settings
 *
 * Ensures voice, format, and speed are within OpenAI TTS constraints.
 *
 * @param settings - Audio script settings to validate
 * @returns Validated settings with defaults
 */
export function validateTTSSettings(
  settings: AudioScriptSettings = {}
): Required<AudioScriptSettings> {
  const validVoices: TTSVoice[] = [
    'alloy',
    'ash',
    'coral',
    'echo',
    'fable',
    'nova',
    'onyx',
    'sage',
    'shimmer',
  ];
  const validFormats: TTSFormat[] = ['mp3', 'opus', 'aac', 'flac', 'wav'];

  const voice = settings.voice && validVoices.includes(settings.voice)
    ? settings.voice
    : 'nova';

  const format = settings.format && validFormats.includes(settings.format)
    ? settings.format
    : 'mp3';

  // Speed must be between 0.25 and 4.0
  let speed = settings.speed ?? 1.0;
  if (speed < 0.25) speed = 0.25;
  if (speed > 4.0) speed = 4.0;

  return { voice, format, speed };
}
