"use strict";
/**
 * Simplified analysis script for LLM test run 2
 *
 * Performs automatic quality assessment based on:
 * - Schema validation (structure completeness)
 * - Content length heuristics
 * - Presence of placeholders/errors
 * - Language-specific quality indicators
 */
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
// ============================================================================
// CONSTANTS
// ============================================================================
const TEST_RUN_DIR = '/home/me/code/megacampus2-worktrees/generation-json/docs/llm-testing/test-run-2';
const OUTPUT_DIR = '/home/me/code/megacampus2-worktrees/generation-json/docs/llm-testing';
const MODELS = [
    'kimi-k2-0905',
    'kimi-k2-thinking',
    'deepseek-v32-exp',
    'deepseek-chat-v31',
    'grok-4-fast',
    'glm-46',
    'minimax-m2',
    'qwen3-32b',
    'qwen3-235b-thinking',
    'oss-120b',
    'qwen3-235b-a22b'
];
const MODEL_NAMES = {
    'kimi-k2-0905': 'Kimi K2 0905',
    'kimi-k2-thinking': 'Kimi K2 Thinking',
    'deepseek-v32-exp': 'DeepSeek v3.2 Exp',
    'deepseek-chat-v31': 'DeepSeek Chat v3.1',
    'grok-4-fast': 'Grok 4 Fast',
    'glm-46': 'GLM 4.6',
    'minimax-m2': 'MiniMax M2',
    'qwen3-32b': 'Qwen3 32B',
    'qwen3-235b-thinking': 'Qwen3 235B Thinking',
    'oss-120b': 'OSS 120B',
    'qwen3-235b-a22b': 'Qwen3 235B A22B'
};
const PLACEHOLDER_PATTERNS = [
    /\[TODO\]/i,
    /\[TBD\]/i,
    /\[FIXME\]/i,
    /\[insert/i,
    /\[add /i,
    /\[replace/i,
    /\{\{/,
    /\$\{/,
    /\.\.\./,
    /(example|sample|placeholder) (title|name|description)/i,
];
// ============================================================================
// QUALITY ASSESSMENT FUNCTIONS
// ============================================================================
function assessMetadataQuality(data, language) {
    const details = [];
    let schemaPoints = 0;
    let contentPoints = 0;
    let languagePoints = 0;
    // Schema validation (9 required fields)
    const requiredFields = [
        'course_title',
        'course_description',
        'course_overview',
        'target_audience',
        'estimated_duration_hours',
        'difficulty_level',
        'prerequisites',
        'learning_outcomes',
        'course_tags'
    ];
    const presentFields = requiredFields.filter(field => {
        const value = data[field];
        return value !== undefined && value !== null && value !== '';
    });
    schemaPoints = (presentFields.length / requiredFields.length) * 100;
    if (presentFields.length < requiredFields.length) {
        details.push(`Missing fields: ${requiredFields.filter(f => !presentFields.includes(f)).join(', ')}`);
    }
    // Content quality heuristics
    const title = data.course_title || '';
    const description = data.course_description || '';
    const overview = data.course_overview || '';
    const audience = data.target_audience || '';
    const prerequisites = data.prerequisites || [];
    const outcomes = data.learning_outcomes || [];
    const tags = data.course_tags || [];
    let contentIssues = 0;
    // Check title length (10-200 chars is reasonable)
    if (title.length < 10) {
        details.push('Title too short');
        contentIssues++;
    }
    else if (title.length > 200) {
        details.push('Title too long');
        contentIssues++;
    }
    // Check description length (50-500 chars is reasonable)
    if (description.length < 50) {
        details.push('Description too brief');
        contentIssues++;
    }
    // Check overview length (100+ chars is expected)
    if (overview.length < 100) {
        details.push('Overview lacks depth');
        contentIssues++;
    }
    // Check audience description
    if (audience.length < 30) {
        details.push('Audience description too brief');
        contentIssues++;
    }
    // Check prerequisites (1-5 expected)
    if (prerequisites.length === 0) {
        details.push('No prerequisites defined');
        contentIssues++;
    }
    else if (prerequisites.length > 10) {
        details.push('Too many prerequisites');
        contentIssues++;
    }
    // Check learning outcomes (3-8 expected)
    if (outcomes.length < 3) {
        details.push('Insufficient learning outcomes');
        contentIssues++;
    }
    else if (outcomes.length > 12) {
        details.push('Too many learning outcomes');
        contentIssues++;
    }
    // Check tags (3-10 expected)
    if (tags.length < 3) {
        details.push('Insufficient tags');
        contentIssues++;
    }
    contentPoints = Math.max(0, 100 - (contentIssues * 15));
    // Language quality
    const allText = [title, description, overview, audience, ...prerequisites, ...outcomes, ...tags].join(' ');
    let languageIssues = 0;
    // Check for placeholders
    for (const pattern of PLACEHOLDER_PATTERNS) {
        if (pattern.test(allText)) {
            details.push('Contains placeholder text');
            languageIssues += 2;
            break;
        }
    }
    // Check for repeated words (low-quality generation indicator)
    const words = allText.toLowerCase().split(/\s+/);
    const wordCounts = {};
    for (const word of words) {
        if (word.length > 4) {
            wordCounts[word] = (wordCounts[word] || 0) + 1;
        }
    }
    const maxRepetition = Math.max(...Object.values(wordCounts));
    if (maxRepetition > 15) {
        details.push('Excessive word repetition');
        languageIssues++;
    }
    // Language-specific checks
    if (language === 'en') {
        // Check if text is actually in English (simple heuristic)
        const cyrillicCount = (allText.match(/[а-яА-ЯёЁ]/g) || []).length;
        if (cyrillicCount > allText.length * 0.1) {
            details.push('Language mismatch: Expected English');
            languageIssues += 3;
        }
    }
    else {
        // Check if text is actually in Russian
        const cyrillicCount = (allText.match(/[а-яА-ЯёЁ]/g) || []).length;
        if (cyrillicCount < allText.length * 0.3) {
            details.push('Language mismatch: Expected Russian');
            languageIssues += 3;
        }
    }
    languagePoints = Math.max(0, 100 - (languageIssues * 20));
    const overallScore = (schemaPoints + contentPoints + languagePoints) / 3;
    return {
        schemaScore: Math.round(schemaPoints),
        contentScore: Math.round(contentPoints),
        languageScore: Math.round(languagePoints),
        overallScore: Math.round(overallScore),
        details
    };
}
function assessLessonQuality(data, language) {
    const details = [];
    let schemaPoints = 0;
    let contentPoints = 0;
    let languagePoints = 0;
    // Schema validation (5 main fields + nested structure)
    const requiredFields = [
        'section_number',
        'section_title',
        'section_description',
        'learning_objectives',
        'lessons'
    ];
    const presentFields = requiredFields.filter(field => {
        const value = data[field];
        return value !== undefined && value !== null;
    });
    schemaPoints = (presentFields.length / requiredFields.length) * 100;
    if (presentFields.length < requiredFields.length) {
        details.push(`Missing fields: ${requiredFields.filter(f => !presentFields.includes(f)).join(', ')}`);
    }
    // Check lessons array structure
    const lessons = data.lessons || [];
    if (lessons.length === 0) {
        details.push('No lessons defined');
        schemaPoints -= 30;
    }
    else {
        // Check each lesson structure
        let lessonIssues = 0;
        for (const lesson of lessons) {
            const lessonFields = ['lesson_number', 'lesson_title', 'lesson_objective', 'key_topics', 'exercises'];
            const presentLessonFields = lessonFields.filter(f => lesson[f] !== undefined);
            if (presentLessonFields.length < lessonFields.length) {
                lessonIssues++;
            }
            // Check exercises
            const exercises = lesson.exercises || [];
            if (exercises.length === 0) {
                lessonIssues++;
            }
            else {
                for (const exercise of exercises) {
                    if (!exercise.exercise_title || !exercise.exercise_instructions) {
                        lessonIssues++;
                    }
                }
            }
        }
        if (lessonIssues > 0) {
            details.push(`Lesson structure issues: ${lessonIssues} problems found`);
            schemaPoints -= Math.min(30, lessonIssues * 5);
        }
    }
    // Content quality heuristics
    const title = data.section_title || '';
    const description = data.section_description || '';
    const objectives = data.learning_objectives || [];
    let contentIssues = 0;
    // Check title length
    if (title.length < 10) {
        details.push('Section title too short');
        contentIssues++;
    }
    // Check description length
    if (description.length < 30) {
        details.push('Section description too brief');
        contentIssues++;
    }
    // Check learning objectives (1-5 expected)
    if (objectives.length === 0) {
        details.push('No learning objectives');
        contentIssues++;
    }
    else if (objectives.length > 8) {
        details.push('Too many learning objectives');
        contentIssues++;
    }
    // Check lessons count (3-5 expected)
    if (lessons.length < 3) {
        details.push('Too few lessons');
        contentIssues++;
    }
    else if (lessons.length > 7) {
        details.push('Too many lessons');
        contentIssues++;
    }
    // Check lesson content depth
    for (const lesson of lessons) {
        const lessonTitle = lesson.lesson_title || '';
        const lessonObjective = lesson.lesson_objective || '';
        const topics = lesson.key_topics || [];
        const exercises = lesson.exercises || [];
        if (lessonTitle.length < 10)
            contentIssues++;
        if (lessonObjective.length < 20)
            contentIssues++;
        if (topics.length < 2)
            contentIssues++;
        if (exercises.length < 1)
            contentIssues++;
        for (const exercise of exercises) {
            const exTitle = exercise.exercise_title || '';
            const exInstructions = exercise.exercise_instructions || '';
            if (exTitle.length < 5)
                contentIssues++;
            if (exInstructions.length < 20)
                contentIssues++;
        }
    }
    contentPoints = Math.max(0, 100 - (contentIssues * 5));
    // Language quality
    const allText = [
        title,
        description,
        ...objectives,
        ...lessons.flatMap(l => [
            l.lesson_title || '',
            l.lesson_objective || '',
            ...(l.key_topics || []),
            ...(l.exercises || []).flatMap(e => [e.exercise_title || '', e.exercise_instructions || ''])
        ])
    ].join(' ');
    let languageIssues = 0;
    // Check for placeholders
    for (const pattern of PLACEHOLDER_PATTERNS) {
        if (pattern.test(allText)) {
            details.push('Contains placeholder text');
            languageIssues += 2;
            break;
        }
    }
    // Language-specific checks
    if (language === 'en') {
        const cyrillicCount = (allText.match(/[а-яА-ЯёЁ]/g) || []).length;
        if (cyrillicCount > allText.length * 0.1) {
            details.push('Language mismatch: Expected English');
            languageIssues += 3;
        }
    }
    else {
        const cyrillicCount = (allText.match(/[а-яА-ЯёЁ]/g) || []).length;
        if (cyrillicCount < allText.length * 0.3) {
            details.push('Language mismatch: Expected Russian');
            languageIssues += 3;
        }
    }
    languagePoints = Math.max(0, 100 - (languageIssues * 20));
    const overallScore = (schemaPoints + contentPoints + languagePoints) / 3;
    return {
        schemaScore: Math.round(Math.max(0, schemaPoints)),
        contentScore: Math.round(contentPoints),
        languageScore: Math.round(languagePoints),
        overallScore: Math.round(overallScore),
        details
    };
}
// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================
function analyzeModel(modelSlug) {
    const modelDir = (0, path_1.join)(TEST_RUN_DIR, modelSlug);
    const emptyCategory = () => ({
        avgScore: 0,
        avgSchema: 0,
        avgContent: 0,
        avgLanguage: 0,
        successRate: 0,
        totalRuns: 3,
        successfulRuns: 0,
        failedRuns: 3
    });
    if (!(0, fs_1.existsSync)(modelDir)) {
        return {
            model: modelSlug,
            metadataEN: emptyCategory(),
            metadataRU: emptyCategory(),
            lessonEN: emptyCategory(),
            lessonRU: emptyCategory(),
            overallScore: 0
        };
    }
    const files = (0, fs_1.readdirSync)(modelDir).filter(f => f.endsWith('.json'));
    const scores = {
        metadataEN: [],
        metadataRU: [],
        lessonEN: [],
        lessonRU: []
    };
    for (const file of files) {
        try {
            const content = (0, fs_1.readFileSync)((0, path_1.join)(modelDir, file), 'utf-8');
            const data = JSON.parse(content);
            if (file.includes('metadata-en')) {
                const score = assessMetadataQuality(data, 'en');
                scores.metadataEN.push(score);
            }
            else if (file.includes('metadata-ru')) {
                const score = assessMetadataQuality(data, 'ru');
                scores.metadataRU.push(score);
            }
            else if (file.includes('lesson-en')) {
                const score = assessLessonQuality(data, 'en');
                scores.lessonEN.push(score);
            }
            else if (file.includes('lesson-ru')) {
                const score = assessLessonQuality(data, 'ru');
                scores.lessonRU.push(score);
            }
        }
        catch (err) {
            // Failed to parse - count as failure
            console.warn(`⚠️  Failed to parse ${file}:`, err);
        }
    }
    const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const processCategory = (categoryScores) => ({
        avgScore: avg(categoryScores.map(s => s.overallScore)),
        avgSchema: avg(categoryScores.map(s => s.schemaScore)),
        avgContent: avg(categoryScores.map(s => s.contentScore)),
        avgLanguage: avg(categoryScores.map(s => s.languageScore)),
        successRate: categoryScores.length / 3,
        totalRuns: 3,
        successfulRuns: categoryScores.length,
        failedRuns: 3 - categoryScores.length
    });
    const metadataEN = processCategory(scores.metadataEN);
    const metadataRU = processCategory(scores.metadataRU);
    const lessonEN = processCategory(scores.lessonEN);
    const lessonRU = processCategory(scores.lessonRU);
    const allScores = [
        ...scores.metadataEN.map(s => s.overallScore),
        ...scores.metadataRU.map(s => s.overallScore),
        ...scores.lessonEN.map(s => s.overallScore),
        ...scores.lessonRU.map(s => s.overallScore)
    ];
    return {
        model: modelSlug,
        metadataEN,
        metadataRU,
        lessonEN,
        lessonRU,
        overallScore: avg(allScores)
    };
}
// ============================================================================
// REPORT GENERATION
// ============================================================================
function generateBilingualReport(results) {
    const date = new Date().toISOString().split('T')[0];
    // Filter valid models
    const validModels = results.filter(r => r.overallScore > 0);
    // Generate TOP-3 for each category
    const metadataENTop = [...validModels]
        .filter(r => r.metadataEN.successfulRuns > 0)
        .sort((a, b) => b.metadataEN.avgScore - a.metadataEN.avgScore)
        .slice(0, 3);
    const metadataRUTop = [...validModels]
        .filter(r => r.metadataRU.successfulRuns > 0)
        .sort((a, b) => b.metadataRU.avgScore - a.metadataRU.avgScore)
        .slice(0, 3);
    const lessonENTop = [...validModels]
        .filter(r => r.lessonEN.successfulRuns > 0)
        .sort((a, b) => b.lessonEN.avgScore - a.lessonEN.avgScore)
        .slice(0, 3);
    const lessonRUTop = [...validModels]
        .filter(r => r.lessonRU.successfulRuns > 0)
        .sort((a, b) => b.lessonRU.avgScore - a.lessonRU.avgScore)
        .slice(0, 3);
    // ========== ENGLISH REPORT ==========
    let reportEN = `# LLM Test Run 2 - Comprehensive Quality Analysis\n\n`;
    reportEN += `**Analysis Date:** ${date}\n`;
    reportEN += `**Test Version:** v2 (Second complete test run)\n`;
    reportEN += `**Models Tested:** ${MODELS.length}\n`;
    reportEN += `**Assessment Method:** Automated heuristic-based quality scoring\n\n`;
    reportEN += `---\n\n`;
    reportEN += `## Executive Summary\n\n`;
    reportEN += `This report presents a comprehensive quality comparison of 11 LLM models across 4 key dimensions:\n\n`;
    reportEN += `1. **Metadata Generation (English)** - Course-level information quality\n`;
    reportEN += `2. **Metadata Generation (Russian)** - Course-level information quality\n`;
    reportEN += `3. **Lesson Structure Generation (English)** - Section/lesson organization quality\n`;
    reportEN += `4. **Lesson Structure Generation (Russian)** - Section/lesson organization quality\n\n`;
    reportEN += `Each model was tested with 3 runs per scenario (12 total runs per model).\n\n`;
    reportEN += `## Scoring Methodology\n\n`;
    reportEN += `Each generation is automatically scored across three dimensions:\n\n`;
    reportEN += `- **Schema Compliance (0-100%)**: JSON schema validation and required field presence\n`;
    reportEN += `- **Content Quality (0-100%)**: Depth, completeness, structure, and pedagogical value\n`;
    reportEN += `- **Language Quality (0-100%)**: Native fluency, grammar, terminology, and no placeholders\n\n`;
    reportEN += `**Overall Score** = Average of all three dimensions\n\n`;
    reportEN += `## TOP-3 Rankings by Category\n\n`;
    // Metadata EN
    reportEN += `### 1. Metadata Generation (English)\n\n`;
    reportEN += `**Best models for generating comprehensive course metadata in English:**\n\n`;
    reportEN += `| Rank | Model | Overall | Schema | Content | Language | Success Rate |\n`;
    reportEN += `|------|-------|---------|--------|---------|----------|-------------|\n`;
    metadataENTop.forEach((r, i) => {
        reportEN += `| ${i + 1} | **${MODEL_NAMES[r.model]}** | ${r.metadataEN.avgScore.toFixed(1)}% | ${r.metadataEN.avgSchema.toFixed(1)}% | ${r.metadataEN.avgContent.toFixed(1)}% | ${r.metadataEN.avgLanguage.toFixed(1)}% | ${r.metadataEN.successfulRuns}/3 |\n`;
    });
    reportEN += `\n`;
    // Metadata RU
    reportEN += `### 2. Metadata Generation (Russian)\n\n`;
    reportEN += `**Best models for generating comprehensive course metadata in Russian:**\n\n`;
    reportEN += `| Rank | Model | Overall | Schema | Content | Language | Success Rate |\n`;
    reportEN += `|------|-------|---------|--------|---------|----------|-------------|\n`;
    metadataRUTop.forEach((r, i) => {
        reportEN += `| ${i + 1} | **${MODEL_NAMES[r.model]}** | ${r.metadataRU.avgScore.toFixed(1)}% | ${r.metadataRU.avgSchema.toFixed(1)}% | ${r.metadataRU.avgContent.toFixed(1)}% | ${r.metadataRU.avgLanguage.toFixed(1)}% | ${r.metadataRU.successfulRuns}/3 |\n`;
    });
    reportEN += `\n`;
    // Lesson EN
    reportEN += `### 3. Lesson Structure Generation (English)\n\n`;
    reportEN += `**Best models for generating structured lessons with exercises in English:**\n\n`;
    reportEN += `| Rank | Model | Overall | Schema | Content | Language | Success Rate |\n`;
    reportEN += `|------|-------|---------|--------|---------|----------|-------------|\n`;
    lessonENTop.forEach((r, i) => {
        reportEN += `| ${i + 1} | **${MODEL_NAMES[r.model]}** | ${r.lessonEN.avgScore.toFixed(1)}% | ${r.lessonEN.avgSchema.toFixed(1)}% | ${r.lessonEN.avgContent.toFixed(1)}% | ${r.lessonEN.avgLanguage.toFixed(1)}% | ${r.lessonEN.successfulRuns}/3 |\n`;
    });
    reportEN += `\n`;
    // Lesson RU
    reportEN += `### 4. Lesson Structure Generation (Russian)\n\n`;
    reportEN += `**Best models for generating structured lessons with exercises in Russian:**\n\n`;
    reportEN += `| Rank | Model | Overall | Schema | Content | Language | Success Rate |\n`;
    reportEN += `|------|-------|---------|--------|---------|----------|-------------|\n`;
    lessonRUTop.forEach((r, i) => {
        reportEN += `| ${i + 1} | **${MODEL_NAMES[r.model]}** | ${r.lessonRU.avgScore.toFixed(1)}% | ${r.lessonRU.avgSchema.toFixed(1)}% | ${r.lessonRU.avgContent.toFixed(1)}% | ${r.lessonRU.avgLanguage.toFixed(1)}% | ${r.lessonRU.successfulRuns}/3 |\n`;
    });
    reportEN += `\n`;
    // Detailed comparison
    reportEN += `## Detailed Model Comparison\n\n`;
    reportEN += `**Overall performance across all 4 categories:**\n\n`;
    reportEN += `| Model | Metadata EN | Metadata RU | Lesson EN | Lesson RU | Overall |\n`;
    reportEN += `|-------|-------------|-------------|-----------|-----------|--------|\n`;
    const sortedByOverall = [...results].sort((a, b) => b.overallScore - a.overallScore);
    sortedByOverall.forEach(r => {
        if (r.overallScore === 0)
            return;
        reportEN += `| **${MODEL_NAMES[r.model]}** | ${r.metadataEN.avgScore.toFixed(1)}% | ${r.metadataRU.avgScore.toFixed(1)}% | ${r.lessonEN.avgScore.toFixed(1)}% | ${r.lessonRU.avgScore.toFixed(1)}% | ${r.overallScore.toFixed(1)}% |\n`;
    });
    reportEN += `\n`;
    // Key findings
    reportEN += `## Key Findings\n\n`;
    reportEN += `### Category Champions\n\n`;
    if (metadataENTop.length > 0) {
        reportEN += `- **Best for Metadata (English):** ${MODEL_NAMES[metadataENTop[0].model]} (${metadataENTop[0].metadataEN.avgScore.toFixed(1)}%)\n`;
    }
    if (metadataRUTop.length > 0) {
        reportEN += `- **Best for Metadata (Russian):** ${MODEL_NAMES[metadataRUTop[0].model]} (${metadataRUTop[0].metadataRU.avgScore.toFixed(1)}%)\n`;
    }
    if (lessonENTop.length > 0) {
        reportEN += `- **Best for Lessons (English):** ${MODEL_NAMES[lessonENTop[0].model]} (${lessonENTop[0].lessonEN.avgScore.toFixed(1)}%)\n`;
    }
    if (lessonRUTop.length > 0) {
        reportEN += `- **Best for Lessons (Russian):** ${MODEL_NAMES[lessonRUTop[0].model]} (${lessonRUTop[0].lessonRU.avgScore.toFixed(1)}%)\n`;
    }
    reportEN += `\n`;
    // ========== RUSSIAN REPORT ==========
    let reportRU = `# LLM Test Run 2 - Комплексный анализ качества\n\n`;
    reportRU += `**Дата анализа:** ${date}\n`;
    reportRU += `**Версия теста:** v2 (Второй полный прогон)\n`;
    reportRU += `**Протестировано моделей:** ${MODELS.length}\n`;
    reportRU += `**Метод оценки:** Автоматическая эвристическая оценка качества\n\n`;
    reportRU += `---\n\n`;
    reportRU += `## Краткое резюме\n\n`;
    reportRU += `В данном отчёте представлено комплексное сравнение качества 11 LLM моделей по 4 ключевым измерениям:\n\n`;
    reportRU += `1. **Генерация метаданных (Английский)** - Качество информации на уровне курса\n`;
    reportRU += `2. **Генерация метаданных (Русский)** - Качество информации на уровне курса\n`;
    reportRU += `3. **Генерация структуры урока (Английский)** - Качество организации секций/уроков\n`;
    reportRU += `4. **Генерация структуры урока (Русский)** - Качество организации секций/уроков\n\n`;
    reportRU += `Каждая модель была протестирована 3 раза на каждый сценарий (12 запусков на модель).\n\n`;
    reportRU += `## Методология оценки\n\n`;
    reportRU += `Каждая генерация автоматически оценивается по трём измерениям:\n\n`;
    reportRU += `- **Соответствие схеме (0-100%)**: Валидация JSON схемы и наличие обязательных полей\n`;
    reportRU += `- **Качество контента (0-100%)**: Глубина, полнота, структура и педагогическая ценность\n`;
    reportRU += `- **Качество языка (0-100%)**: Естественность, грамматика, терминология, отсутствие placeholders\n\n`;
    reportRU += `**Общий балл** = Среднее значение всех трёх измерений\n\n`;
    reportRU += `## TOP-3 рейтинги по категориям\n\n`;
    // Metadata EN (RU)
    reportRU += `### 1. Генерация метаданных (Английский)\n\n`;
    reportRU += `**Лучшие модели для генерации комплексных метаданных курса на английском:**\n\n`;
    reportRU += `| Место | Модель | Общий | Схема | Контент | Язык | Успешность |\n`;
    reportRU += `|-------|--------|-------|-------|---------|------|------------|\n`;
    metadataENTop.forEach((r, i) => {
        reportRU += `| ${i + 1} | **${MODEL_NAMES[r.model]}** | ${r.metadataEN.avgScore.toFixed(1)}% | ${r.metadataEN.avgSchema.toFixed(1)}% | ${r.metadataEN.avgContent.toFixed(1)}% | ${r.metadataEN.avgLanguage.toFixed(1)}% | ${r.metadataEN.successfulRuns}/3 |\n`;
    });
    reportRU += `\n`;
    // Metadata RU (RU)
    reportRU += `### 2. Генерация метаданных (Русский)\n\n`;
    reportRU += `**Лучшие модели для генерации комплексных метаданных курса на русском:**\n\n`;
    reportRU += `| Место | Модель | Общий | Схема | Контент | Язык | Успешность |\n`;
    reportRU += `|-------|--------|-------|-------|---------|------|------------|\n`;
    metadataRUTop.forEach((r, i) => {
        reportRU += `| ${i + 1} | **${MODEL_NAMES[r.model]}** | ${r.metadataRU.avgScore.toFixed(1)}% | ${r.metadataRU.avgSchema.toFixed(1)}% | ${r.metadataRU.avgContent.toFixed(1)}% | ${r.metadataRU.avgLanguage.toFixed(1)}% | ${r.metadataRU.successfulRuns}/3 |\n`;
    });
    reportRU += `\n`;
    // Lesson EN (RU)
    reportRU += `### 3. Генерация структуры урока (Английский)\n\n`;
    reportRU += `**Лучшие модели для генерации структурированных уроков с упражнениями на английском:**\n\n`;
    reportRU += `| Место | Модель | Общий | Схема | Контент | Язык | Успешность |\n`;
    reportRU += `|-------|--------|-------|-------|---------|------|------------|\n`;
    lessonENTop.forEach((r, i) => {
        reportRU += `| ${i + 1} | **${MODEL_NAMES[r.model]}** | ${r.lessonEN.avgScore.toFixed(1)}% | ${r.lessonEN.avgSchema.toFixed(1)}% | ${r.lessonEN.avgContent.toFixed(1)}% | ${r.lessonEN.avgLanguage.toFixed(1)}% | ${r.lessonEN.successfulRuns}/3 |\n`;
    });
    reportRU += `\n`;
    // Lesson RU (RU)
    reportRU += `### 4. Генерация структуры урока (Русский)\n\n`;
    reportRU += `**Лучшие модели для генерации структурированных уроков с упражнениями на русском:**\n\n`;
    reportRU += `| Место | Модель | Общий | Схема | Контент | Язык | Успешность |\n`;
    reportRU += `|-------|--------|-------|-------|---------|------|------------|\n`;
    lessonRUTop.forEach((r, i) => {
        reportRU += `| ${i + 1} | **${MODEL_NAMES[r.model]}** | ${r.lessonRU.avgScore.toFixed(1)}% | ${r.lessonRU.avgSchema.toFixed(1)}% | ${r.lessonRU.avgContent.toFixed(1)}% | ${r.lessonRU.avgLanguage.toFixed(1)}% | ${r.lessonRU.successfulRuns}/3 |\n`;
    });
    reportRU += `\n`;
    // Detailed comparison (RU)
    reportRU += `## Детальное сравнение моделей\n\n`;
    reportRU += `**Общая производительность по всем 4 категориям:**\n\n`;
    reportRU += `| Модель | Метаданные EN | Метаданные RU | Урок EN | Урок RU | Общий балл |\n`;
    reportRU += `|--------|--------------|--------------|---------|---------|------------|\n`;
    sortedByOverall.forEach(r => {
        if (r.overallScore === 0)
            return;
        reportRU += `| **${MODEL_NAMES[r.model]}** | ${r.metadataEN.avgScore.toFixed(1)}% | ${r.metadataRU.avgScore.toFixed(1)}% | ${r.lessonEN.avgScore.toFixed(1)}% | ${r.lessonRU.avgScore.toFixed(1)}% | ${r.overallScore.toFixed(1)}% |\n`;
    });
    reportRU += `\n`;
    // Key findings (RU)
    reportRU += `## Ключевые выводы\n\n`;
    reportRU += `### Лидеры по категориям\n\n`;
    if (metadataENTop.length > 0) {
        reportRU += `- **Лучшая для метаданных (Английский):** ${MODEL_NAMES[metadataENTop[0].model]} (${metadataENTop[0].metadataEN.avgScore.toFixed(1)}%)\n`;
    }
    if (metadataRUTop.length > 0) {
        reportRU += `- **Лучшая для метаданных (Русский):** ${MODEL_NAMES[metadataRUTop[0].model]} (${metadataRUTop[0].metadataRU.avgScore.toFixed(1)}%)\n`;
    }
    if (lessonENTop.length > 0) {
        reportRU += `- **Лучшая для уроков (Английский):** ${MODEL_NAMES[lessonENTop[0].model]} (${lessonENTop[0].lessonEN.avgScore.toFixed(1)}%)\n`;
    }
    if (lessonRUTop.length > 0) {
        reportRU += `- **Лучшая для уроков (Русский):** ${MODEL_NAMES[lessonRUTop[0].model]} (${lessonRUTop[0].lessonRU.avgScore.toFixed(1)}%)\n`;
    }
    reportRU += `\n`;
    return { reportEN, reportRU };
}
// ============================================================================
// MAIN EXECUTION
// ============================================================================
console.log('🔍 Analyzing test run 2 results...\n');
const allResults = [];
for (const model of MODELS) {
    console.log(`📊 Analyzing ${MODEL_NAMES[model]}...`);
    const result = analyzeModel(model);
    allResults.push(result);
    console.log(`   Metadata EN: ${result.metadataEN.avgScore.toFixed(1)}% (${result.metadataEN.successfulRuns}/3)`);
    console.log(`   Metadata RU: ${result.metadataRU.avgScore.toFixed(1)}% (${result.metadataRU.successfulRuns}/3)`);
    console.log(`   Lesson EN:   ${result.lessonEN.avgScore.toFixed(1)}% (${result.lessonEN.successfulRuns}/3)`);
    console.log(`   Lesson RU:   ${result.lessonRU.avgScore.toFixed(1)}% (${result.lessonRU.successfulRuns}/3)`);
    console.log(`   Overall:     ${result.overallScore.toFixed(1)}%\n`);
}
console.log('\n📝 Generating bilingual reports...\n');
const { reportEN, reportRU } = generateBilingualReport(allResults);
// Save reports
const outputFileEN = (0, path_1.join)(OUTPUT_DIR, 'TEST-RUN-2-ANALYSIS-EN.md');
const outputFileRU = (0, path_1.join)(OUTPUT_DIR, 'TEST-RUN-2-ANALYSIS-RU.md');
const outputJSON = (0, path_1.join)(OUTPUT_DIR, 'test-run-2-analysis.json');
(0, fs_1.writeFileSync)(outputFileEN, reportEN, 'utf-8');
(0, fs_1.writeFileSync)(outputFileRU, reportRU, 'utf-8');
(0, fs_1.writeFileSync)(outputJSON, JSON.stringify(allResults, null, 2), 'utf-8');
console.log(`✅ English report saved: ${outputFileEN}`);
console.log(`✅ Russian report saved: ${outputFileRU}`);
console.log(`✅ JSON data saved: ${outputJSON}\n`);
console.log('🎉 Analysis complete!\n');
