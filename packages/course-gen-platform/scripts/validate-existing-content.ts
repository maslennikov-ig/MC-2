#!/usr/bin/env tsx
/**
 * Validate Existing Lesson Content
 * @module scripts/validate-existing-content
 *
 * Runs heuristic validators on existing lesson content from database.
 * Useful for checking if validators catch known issues.
 *
 * Usage:
 * pnpm tsx scripts/validate-existing-content.ts --lesson-id 8c3623c0-07e5-4e01-853d-ff3eab14a546
 */

import 'dotenv/config';
import { program } from 'commander';
import { getSupabaseAdmin } from '@/shared/supabase/admin';
import logger from '@/shared/logger';
import {
  checkPromptMarkers,
  checkLanguageConsistency,
  checkMermaidSyntax,
  checkSectionDuplication,
} from '@/stages/stage6-lesson-content/judge/heuristic-filter';

interface ValidationResult {
  sectionTitle: string;
  promptMarkers: string[];
  foreignCharacters: number;
  mermaidIssues: string[];
  duplicateSections: string[];
  hasMermaid: boolean;
}

async function main(): Promise<void> {
  program
    .requiredOption('--lesson-id <id>', 'Lesson UUID to validate')
    .option('--language <lang>', 'Expected language', 'ru')
    .parse();

  const options = program.opts();
  const lessonId = options.lessonId;
  const language = options.language;

  console.log(`\n${'='.repeat(80)}`);
  console.log('EXISTING CONTENT VALIDATION');
  console.log(`${'='.repeat(80)}`);
  console.log(`\nLesson ID: ${lessonId}`);
  console.log(`Language: ${language}\n`);

  const supabase = getSupabaseAdmin();

  // Fetch lesson content
  const { data: lessonContent, error } = await supabase
    .from('lesson_contents')
    .select('id, lesson_id, status, content')
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !lessonContent) {
    console.error(`Failed to load lesson content: ${error?.message || 'Not found'}`);
    process.exit(1);
  }

  console.log(`Found lesson content: ${lessonContent.id}`);
  console.log(`Status: ${lessonContent.status}\n`);

  // Extract sections from content
  const content = lessonContent.content as {
    content?: {
      sections?: Array<{ title: string; content: string }>;
      introduction?: string;
    };
  };

  const sections = content?.content?.sections || [];
  const introduction = content?.content?.introduction || '';

  console.log(`Sections found: ${sections.length}`);
  console.log(`Has introduction: ${introduction ? 'Yes' : 'No'}\n`);

  // Validate each section
  const results: ValidationResult[] = [];
  let totalIssues = 0;

  // Validate introduction if exists
  if (introduction) {
    const promptResult = checkPromptMarkers(introduction);
    const langResult = checkLanguageConsistency(introduction, language);
    const mermaidResult = checkMermaidSyntax(introduction);
    const dupResult = checkSectionDuplication(introduction);

    const issues =
      promptResult.detectedMarkers.length +
      langResult.foreignCharacters +
      mermaidResult.mermaidIssues.length +
      dupResult.duplicatePairs.length;

    totalIssues += issues;

    results.push({
      sectionTitle: '[Introduction]',
      promptMarkers: promptResult.detectedMarkers,
      foreignCharacters: langResult.foreignCharacters,
      mermaidIssues: mermaidResult.mermaidIssues,
      duplicateSections: dupResult.duplicatePairs,
      hasMermaid: introduction.includes('```mermaid'),
    });
  }

  // Validate each section
  for (const section of sections) {
    const sectionContent = section.content || '';

    const promptResult = checkPromptMarkers(sectionContent);
    const langResult = checkLanguageConsistency(sectionContent, language);
    const mermaidResult = checkMermaidSyntax(sectionContent);
    const dupResult = checkSectionDuplication(sectionContent);

    const issues =
      promptResult.detectedMarkers.length +
      langResult.foreignCharacters +
      mermaidResult.mermaidIssues.length +
      dupResult.duplicatePairs.length;

    totalIssues += issues;

    results.push({
      sectionTitle: section.title,
      promptMarkers: promptResult.detectedMarkers,
      foreignCharacters: langResult.foreignCharacters,
      mermaidIssues: mermaidResult.mermaidIssues,
      duplicateSections: dupResult.duplicatePairs,
      hasMermaid: sectionContent.includes('```mermaid'),
    });
  }

  // Print results
  console.log('$'.repeat(80));
  console.log('VALIDATION RESULTS');
  console.log('$'.repeat(80));

  for (const result of results) {
    const hasIssues =
      result.promptMarkers.length > 0 ||
      result.foreignCharacters > 0 ||
      result.mermaidIssues.length > 0 ||
      result.duplicateSections.length > 0;

    const mermaidBadge = result.hasMermaid ? ' [MERMAID]' : '';
    const status = hasIssues ? '❌' : '✅';

    console.log(`\n${status} ${result.sectionTitle}${mermaidBadge}`);

    if (result.promptMarkers.length > 0) {
      console.log(`   ⚠️  Prompt Markers (${result.promptMarkers.length}):`);
      for (const marker of result.promptMarkers.slice(0, 3)) {
        console.log(`       - "${marker.slice(0, 50)}..."`);
      }
      if (result.promptMarkers.length > 3) {
        console.log(`       ... and ${result.promptMarkers.length - 3} more`);
      }
    }

    if (result.foreignCharacters > 0) {
      console.log(`   ⚠️  Foreign Characters: ${result.foreignCharacters}`);
    }

    if (result.mermaidIssues.length > 0) {
      console.log(`   ⚠️  Mermaid Issues (${result.mermaidIssues.length}):`);
      for (const issue of result.mermaidIssues.slice(0, 3)) {
        console.log(`       - ${issue}`);
      }
    }

    if (result.duplicateSections.length > 0) {
      console.log(`   ⚠️  Duplicate Sections: ${result.duplicateSections.length}`);
    }
  }

  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(80)}`);

  const sectionsWithPromptMarkers = results.filter(r => r.promptMarkers.length > 0).length;
  const sectionsWithCJK = results.filter(r => r.foreignCharacters > 0).length;
  const sectionsWithMermaidIssues = results.filter(r => r.mermaidIssues.length > 0).length;
  const sectionsWithMermaid = results.filter(r => r.hasMermaid).length;
  const cleanSections = results.filter(
    r =>
      r.promptMarkers.length === 0 &&
      r.foreignCharacters === 0 &&
      r.mermaidIssues.length === 0 &&
      r.duplicateSections.length === 0
  ).length;

  console.log(`\nTotal sections analyzed: ${results.length}`);
  console.log(`Sections with Mermaid diagrams: ${sectionsWithMermaid}`);
  console.log(`\nIssues detected:`);
  console.log(`  - Prompt markers: ${sectionsWithPromptMarkers} sections`);
  console.log(`  - CJK characters: ${sectionsWithCJK} sections`);
  console.log(`  - Mermaid issues: ${sectionsWithMermaidIssues} sections`);
  console.log(`\nClean sections: ${cleanSections}/${results.length}`);
  console.log(`Total issues: ${totalIssues}`);
  console.log(`${'='.repeat(80)}\n`);

  process.exit(totalIssues > 0 ? 1 : 0);
}

main().catch(error => {
  logger.error({ error }, 'Fatal error in validation script');
  console.error('Fatal error:', error);
  process.exit(1);
});
