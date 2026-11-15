import type { GenerationRpcClient } from './generation-types';
import { RoleInterviewError } from './role-interview-schema';
import type { InterviewKey, InterviewRepository } from './role-interview';

export function createPostgresInterviewRepository(
  client: GenerationRpcClient
): InterviewRepository {
  function args(key: InterviewKey) {
    return {
      p_binding_id: key.bindingId,
      p_interview_id: key.interviewId,
      p_revision: key.revision,
      p_round: key.round,
    };
  }
  async function rpc<T>(name: string, input: Record<string, unknown>): Promise<T> {
    const result = await client.rpc<T>(name, input);
    if (result.error) {
      if (result.error.message.includes('INTERVIEW_CONFLICT'))
        throw new RoleInterviewError(409, 'interview_request_conflict');
      if (result.error.message.includes('INTERVIEW_BINDING_DENIED'))
        throw new RoleInterviewError(403, 'binding_denied');
      if (result.error.message.includes('INTERVIEW_PREVIOUS'))
        throw new RoleInterviewError(409, 'interview_invalid_previous_result');
      throw new Error('Role interview persistence unavailable');
    }
    return result.data as T;
  }
  return {
    read: key => rpc('read_helixa_role_interview_round', args(key)),
    claim: input =>
      rpc('claim_helixa_role_interview_round', {
        ...args(input.key),
        p_request_hash: input.requestHash,
        p_request_payload: input.request,
        p_rendered_prompt: input.renderedPrompt,
        p_prompt_hash: input.promptHash,
      }),
    async finish(key, token, body, costs) {
      const accepted = await rpc<boolean>('finish_helixa_role_interview_round', {
        ...args(key),
        p_claim_token: token,
        p_response_body: body,
        p_cost_records: costs,
      });
      if (!accepted) throw new Error('Role interview claim lost');
    },
    async uncertain(key, token, costs) {
      await rpc('uncertain_helixa_role_interview_round', {
        ...args(key),
        p_claim_token: token,
        p_cost_records: costs,
      });
    },
  };
}
