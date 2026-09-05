/**
 * The `CREATE_JOB_INSTRUCTION` half of the live native port.
 *
 * `schedule_helixa_course_from_role_guide` has existed for the course command since
 * 2026-08-23. The job-instruction command had no scheduler at all, so `live` mode could
 * only refuse it. This is its counterpart.
 *
 * It is two steps, not one, and that is forced rather than chosen: `job_outbox.entity_id`
 * is `REFERENCES courses(id)`, so a career playbook cannot be enqueued from inside the
 * same transaction the way a course is. The RPC writes the row under the command's lease
 * fence; this module then enqueues the same BullMQ job the product enqueues, and calls the
 * compensating RPC if that throws — which is exactly the sequence
 * `approveCareerPlaybookGeneration` follows.
 */

import {
  CareerPlaybookQADataSchema,
  JobType,
  type CareerPlaybookGeneratePlaybookJobData,
  type CareerPlaybookQAData,
} from '@megacampus/shared-types';

import { addJob, removeTerminalJobById, QUEUE_NAME } from '@/orchestrator/queue';
import { getCareerPlaybookGenerationJobId } from '@/server/routers/career-playbook/job-ids';
import logger from '@/shared/logger';

import type { GenerationRpcClient, HelixaGenerationNativeDependencies } from './generation-types';

type ScheduleRoleGuide = HelixaGenerationNativeDependencies['scheduleRoleGuide'];
type ScheduleRoleGuideInput = Parameters<ScheduleRoleGuide>[0];

export interface HelixaRoleGuideEnqueue {
  (input: {
    playbookId: string;
    organizationId: string;
    userId: string;
    language: 'ru' | 'en';
    qaData: CareerPlaybookQAData;
  }): Promise<void>;
}

/**
 * The enqueue the product uses: same queue, same job type, same deterministic job id, so a
 * replayed command adds nothing rather than starting a second generation of one playbook.
 */
export function createCareerPlaybookGenerationEnqueue(): HelixaRoleGuideEnqueue {
  return async input => {
    const jobId = getCareerPlaybookGenerationJobId(input.playbookId);
    await removeTerminalJobById(jobId);
    const jobData: CareerPlaybookGeneratePlaybookJobData = {
      jobType: JobType.CAREER_PLAYBOOK,
      operation: 'GENERATE_PLAYBOOK',
      playbookId: input.playbookId,
      userId: input.userId,
      organizationId: input.organizationId,
      language: input.language,
      qaData: input.qaData,
      createdAt: new Date().toISOString(),
      locale: input.language === 'en' ? 'en' : 'ru',
    };
    await addJob(JobType.CAREER_PLAYBOOK, jobData, { jobId });
    logger.info(
      { playbookId: input.playbookId, queue: QUEUE_NAME },
      'Helixa role guide generation enqueued'
    );
  };
}

export function createPostgresHelixaRoleGuideScheduler(
  client: GenerationRpcClient,
  enqueue: HelixaRoleGuideEnqueue
): ScheduleRoleGuide {
  return async (input: ScheduleRoleGuideInput) => {
    // Parse before writing. The worker parses this same object with the same schema, so a
    // shape it would reject must fail here, where the command can still be refused, rather
    // than in a job that has already been paid for.
    const qaData = CareerPlaybookQADataSchema.parse(input.qAData);

    const scheduled = await client.rpc<boolean>('schedule_helixa_role_guide', {
      p_binding_id: input.originBindingId,
      p_command_id: input.originCommandId,
      p_playbook_id: input.playbookId,
      p_organization_id: input.organizationId,
      p_user_id: input.userId,
      p_job_instruction: input.jobInstruction,
      p_selected_sources: input.selectedSources,
      p_qa_data: qaData,
      p_lease_token: input.leaseToken,
      p_claim_generation: input.claimGeneration,
    });
    if (scheduled.error) throw new Error(scheduled.error.message);
    // False means a playbook with this id already exists in some state other than
    // `generating`: an earlier claim took it further, and starting a job now would race it.
    if (scheduled.data !== true) return;

    try {
      await enqueue({
        playbookId: input.playbookId,
        organizationId: input.organizationId,
        userId: input.userId,
        language: input.language,
        qaData,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const compensation = await client.rpc<boolean>('fail_helixa_role_guide_generation', {
        p_binding_id: input.originBindingId,
        p_command_id: input.originCommandId,
        p_playbook_id: input.playbookId,
        p_organization_id: input.organizationId,
        p_lease_token: input.leaseToken,
        p_claim_generation: input.claimGeneration,
        p_reason: reason,
      });
      if (compensation.error || compensation.data !== true) {
        // The row is in `generating` with nothing behind it and the compensation did not
        // land. Say so: the safe error code alone would not tell anyone which half failed.
        logger.error(
          { playbookId: input.playbookId, err: error },
          'Helixa role guide enqueue failed and the compensating write did not land'
        );
      }
      throw new Error(`ROLE_GUIDE_GENERATION_ENQUEUE_FAILED: ${reason}`);
    }
  };
}
