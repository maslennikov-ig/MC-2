export function getCareerPlaybookGenerationJobId(playbookId: string): string {
  // BullMQ custom job ids cannot contain ":" because Redis keys use it as a separator.
  return `career-playbook-${playbookId}`;
}
