/**
 * Manually trigger auto-approval for a course stuck in awaiting_approval state
 * Usage: npx dotenv-cli -e .env -- npx tsx scripts/trigger-auto-approve.ts <courseId> <stageNumber>
 */
import { handleStageCompletion } from '../src/shared/auto-approval';

async function main() {
  const courseId = process.argv[2];
  const stage = parseInt(process.argv[3] || '2', 10);

  if (!courseId) {
    console.error(
      'Usage: npx dotenv-cli -e .env -- npx tsx scripts/trigger-auto-approve.ts <courseId> [stageNumber]'
    );
    process.exit(1);
  }

  console.log(`Triggering auto-approval for course ${courseId}, stage ${stage}...`);

  try {
    const result = await handleStageCompletion(courseId, stage);
    console.log('Result:', result);

    if (result.autoApproved) {
      console.log('✅ Auto-approval successful!');
    } else {
      console.log('⚠️ Auto-approval skipped (check if course is in automatic mode)');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }

  process.exit(0);
}

main();
