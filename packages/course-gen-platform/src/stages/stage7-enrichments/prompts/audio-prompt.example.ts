/**
 * Audio TTS Preprocessing Module - Usage Examples
 * @module stages/stage7-enrichments/prompts/audio-prompt.example
 *
 * Demonstrates how to use the audio TTS preprocessing utilities
 * to prepare lesson content for OpenAI TTS synthesis.
 */

import {
  prepareAudioScript,
  chunkAudioScript,
  getDefaultVoice,
  estimateAudioDuration,
  validateTTSSettings,
  type AudioScriptParams,
  type ProcessedAudioScript,
} from './audio-prompt';

// ============================================================================
// Example 1: Basic Usage - Convert lesson content to TTS script
// ============================================================================

function example1_BasicUsage() {
  const lessonContent = `
# Introduction to TypeScript

TypeScript is a **strongly typed** programming language that builds on JavaScript.

## Key Features

- Static type checking
- Enhanced IDE support
- Better refactoring capabilities

\`\`\`typescript
const greeting: string = "Hello, TypeScript!";
console.log(greeting);
\`\`\`

Learn more at [TypeScript Official Docs](https://www.typescriptlang.org).
  `;

  const params: AudioScriptParams = {
    lessonTitle: 'Introduction to TypeScript',
    lessonContent: lessonContent,
    language: 'en',
    settings: {
      voice: 'nova',
      format: 'mp3',
      speed: 1.0,
    },
  };

  const result: ProcessedAudioScript = prepareAudioScript(params);

  console.log('=== Example 1: Basic Usage ===');
  console.log('Original length:', lessonContent.length, 'chars');
  console.log('Processed length:', result.charCount, 'chars');
  console.log('Word count:', result.wordCount);
  console.log('Estimated duration:', result.estimatedDurationSeconds, 'seconds');
  console.log('\nProcessed script preview:');
  console.log(result.script.substring(0, 200) + '...\n');

  // Output:
  // - Markdown formatting removed
  // - Code blocks replaced with "The following code example is written in typescript."
  // - Lists converted to sentences with transitions
  // - Links text preserved, URLs removed
}

// ============================================================================
// Example 2: Russian Language Support
// ============================================================================

function example2_RussianLanguage() {
  const lessonContent = `
# Введение в TypeScript

TypeScript — это **строго типизированный** язык программирования.

## Основные возможности

- Статическая проверка типов
- Улучшенная поддержка IDE
- Лучший рефакторинг

\`\`\`typescript
const greeting: string = "Привет, TypeScript!";
\`\`\`
  `;

  const params: AudioScriptParams = {
    lessonTitle: 'Введение в TypeScript',
    lessonContent: lessonContent,
    language: 'ru',
  };

  const result = prepareAudioScript(params);

  console.log('=== Example 2: Russian Language ===');
  console.log('Processed script preview:');
  console.log(result.script.substring(0, 200) + '...\n');

  // Output in Russian:
  // - Code blocks: "Далее следует пример кода на языке typescript."
  // - Lists: "Во-первых, ...", "Во-вторых, ...", etc.
}

// ============================================================================
// Example 3: Handling Long Content with Chunking
// ============================================================================

function example3_LongContent() {
  // Simulate a very long lesson (> 4096 chars)
  const longLesson = `
# Comprehensive TypeScript Guide

${'## Section ' + 'A'.repeat(500)}\n\n${'This is content. '.repeat(200)}
${'## Section ' + 'B'.repeat(500)}\n\n${'This is content. '.repeat(200)}
${'## Section ' + 'C'.repeat(500)}\n\n${'This is content. '.repeat(200)}
  `;

  const params: AudioScriptParams = {
    lessonTitle: 'TypeScript Deep Dive',
    lessonContent: longLesson,
    language: 'en',
  };

  const result = prepareAudioScript(params);

  console.log('=== Example 3: Long Content with Chunking ===');
  console.log('Total characters:', result.charCount);
  console.log('Needs chunking?', result.chunks ? 'YES' : 'NO');

  if (result.chunks) {
    console.log('Number of chunks:', result.chunks.length);
    result.chunks.forEach((chunk, index) => {
      console.log(`Chunk ${index + 1}: ${chunk.length} chars`);
    });

    // Each chunk can now be sent to OpenAI TTS separately
    // and the audio files can be concatenated
  }

  console.log('\n');
}

// ============================================================================
// Example 4: Manual Chunking for Batch Processing
// ============================================================================

function example4_ManualChunking() {
  const longScript = 'This is a sentence. '.repeat(300); // ~6000 chars

  // Chunk at sentence boundaries with 4000 char limit
  const chunks = chunkAudioScript(longScript, 4000);

  console.log('=== Example 4: Manual Chunking ===');
  console.log('Original length:', longScript.length, 'chars');
  console.log('Number of chunks:', chunks.length);

  chunks.forEach((chunk, index) => {
    const duration = estimateAudioDuration(chunk, 1.0);
    console.log(`Chunk ${index + 1}: ${chunk.length} chars, ~${duration}s duration`);
  });

  console.log('\n');
}

// ============================================================================
// Example 5: Voice Selection and Settings Validation
// ============================================================================

function example5_VoiceSettings() {
  console.log('=== Example 5: Voice Selection and Settings ===');

  // Get default voice for language
  const englishVoice = getDefaultVoice('en');
  const russianVoice = getDefaultVoice('ru');

  console.log('Default voice for English:', englishVoice);
  console.log('Default voice for Russian:', russianVoice);

  // Validate custom settings
  const customSettings = validateTTSSettings({
    voice: 'alloy',
    format: 'opus',
    speed: 1.5,
  });

  console.log('Validated settings:', customSettings);

  // Test edge cases
  const invalidSettings = validateTTSSettings({
    voice: 'invalid_voice' as any,
    format: 'invalid_format' as any,
    speed: 10.0, // Too fast, will be clamped to 4.0
  });

  console.log('Invalid settings (corrected):', invalidSettings);
  console.log('\n');
}

// ============================================================================
// Example 6: Duration Estimation at Different Speeds
// ============================================================================

function example6_DurationEstimation() {
  const script = 'word '.repeat(150); // 150 words

  console.log('=== Example 6: Duration Estimation ===');
  console.log('Script word count: 150 words\n');

  const speeds = [0.5, 1.0, 1.5, 2.0];

  speeds.forEach((speed) => {
    const duration = estimateAudioDuration(script, speed);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;

    console.log(`Speed ${speed}x: ${duration}s (${minutes}m ${seconds}s)`);
  });

  console.log('\n');

  // Output:
  // Speed 0.5x: 120s (2m 0s)
  // Speed 1.0x: 60s (1m 0s)
  // Speed 1.5x: 40s (0m 40s)
  // Speed 2.0x: 30s (0m 30s)
}

// ============================================================================
// Example 7: Real-World Integration with OpenAI TTS API
// ============================================================================

async function example7_OpenAIIntegration() {
  console.log('=== Example 7: OpenAI TTS Integration (Pseudo-code) ===\n');

  const lessonContent = `
# JavaScript Async/Await

Async/await makes asynchronous code look synchronous.

\`\`\`javascript
async function fetchData() {
  const response = await fetch('/api/data');
  return response.json();
}
\`\`\`
  `;

  // Step 1: Prepare the audio script
  const params: AudioScriptParams = {
    lessonTitle: 'JavaScript Async/Await',
    lessonContent: lessonContent,
    language: 'en',
    settings: {
      voice: 'nova',
      format: 'mp3',
      speed: 1.0,
    },
  };

  const result = prepareAudioScript(params);

  console.log('Step 1: Script prepared');
  console.log(`- Characters: ${result.charCount}`);
  console.log(`- Duration: ~${result.estimatedDurationSeconds}s`);

  // Step 2: If chunking needed, process each chunk
  if (result.chunks) {
    console.log(`\nStep 2: Processing ${result.chunks.length} chunks\n`);

    // Pseudo-code for OpenAI TTS API integration:
    // for (const [index, chunk] of result.chunks.entries()) {
    //   const audio = await openai.audio.speech.create({
    //     model: "tts-1",
    //     voice: params.settings.voice,
    //     input: chunk,
    //     response_format: params.settings.format,
    //     speed: params.settings.speed,
    //   });
    //
    //   await saveAudioFile(`lesson_part_${index + 1}.mp3`, audio);
    // }
    //
    // // Concatenate audio files
    // await concatenateAudioFiles(result.chunks.length, 'final_lesson_audio.mp3');

    console.log('(See code comments for OpenAI TTS API integration)');
  } else {
    console.log('\nStep 2: Single chunk processing\n');

    // Pseudo-code for single chunk:
    // const audio = await openai.audio.speech.create({
    //   model: "tts-1",
    //   voice: params.settings.voice,
    //   input: result.script,
    //   response_format: params.settings.format,
    //   speed: params.settings.speed,
    // });
    //
    // await saveAudioFile('lesson_audio.mp3', audio);

    console.log('(See code comments for OpenAI TTS API integration)');
  }

  console.log('\n');
}

// ============================================================================
// Run Examples
// ============================================================================

if (require.main === module) {
  console.log('Audio TTS Preprocessing Module - Usage Examples\n');
  console.log('='.repeat(70) + '\n');

  example1_BasicUsage();
  example2_RussianLanguage();
  example3_LongContent();
  example4_ManualChunking();
  example5_VoiceSettings();
  example6_DurationEstimation();
  example7_OpenAIIntegration();

  console.log('='.repeat(70));
  console.log('All examples completed!\n');
}

// Export for use in other modules
export {
  example1_BasicUsage,
  example2_RussianLanguage,
  example3_LongContent,
  example4_ManualChunking,
  example5_VoiceSettings,
  example6_DurationEstimation,
  example7_OpenAIIntegration,
};
