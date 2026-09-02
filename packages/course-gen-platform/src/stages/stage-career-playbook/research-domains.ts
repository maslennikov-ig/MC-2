/**
 * Career Playbook — the houses a reader treats as primary research.
 * @module stages/stage-career-playbook/research-domains
 *
 * One list, two users that must agree. Retrieval runs a lane restricted to
 * these domains so a run has somewhere to point when it names an analyst house,
 * and `classifyCareerPlaybookSource` labels what came back. When the two lists
 * drifted, retrieval could bring back a source the classifier then called a
 * vendor blog, and the guide's own attribution check would refuse it.
 *
 * Run 88fc2368 named Gartner while citing a sales-training vendor's blog, and
 * regenerating the block twice could not fix it: no source in that run was
 * research at all, so the sentence had nowhere honest to go (mc2-r1qen).
 */

/** Analyst, statistical and institutional publishers, as searchable domains. */
export const CAREER_PLAYBOOK_RESEARCH_DOMAINS = [
  'gartner.com',
  'forrester.com',
  'mckinsey.com',
  'bain.com',
  'bcg.com',
  'deloitte.com',
  'pwc.com',
  'kpmg.com',
  'hbr.org',
  'nber.org',
  'oecd.org',
  'statista.com',
  'pewresearch.org',
  'nature.com',
  'springer.com',
  'acm.org',
  'ieee.org',
] as const;

/**
 * Hosts of the domains above, plus the academic and government suffixes that
 * are a class rather than a site and so cannot be searched by name.
 */
export const CAREER_PLAYBOOK_RESEARCH_DOMAIN_PATTERN = new RegExp(
  `(?:^|\\.)(?:${CAREER_PLAYBOOK_RESEARCH_DOMAINS.map(domain => domain.split('.')[0]).join(
    '|'
  )})\\.|\\.(?:edu|ac\\.uk|gov)(?:$|/)`,
  'i'
);
