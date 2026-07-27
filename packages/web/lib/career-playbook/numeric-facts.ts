export function getCareerPlaybookNumericFactDomId(factId: string) {
  return `career-playbook-numeric-fact-${factId.replace(/[^A-Za-z0-9_-]+/g, '-')}`
}
