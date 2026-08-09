import 'dotenv/config';
import {
  type CareerPlaybookSmokeMode,
  type CareerPlaybookTargetEnvironment,
  formatCareerPlaybookSmokeReport,
  runCareerPlaybookSmokePreflight,
} from '../src/smoke/career-playbook-preflight';

interface ParsedArgs {
  mode: CareerPlaybookSmokeMode;
  targetEnvironment?: CareerPlaybookTargetEnvironment;
  json: boolean;
}

function printUsage(): void {
  console.log(`Usage: pnpm --filter @megacampus/course-gen-platform smoke:career-playbook:preflight [options]

Options:
  --mode <read-only|mutation-smoke>       Preflight mode (default: read-only)
  --target <local|development|dev|staging|production|prod>
                                         Target environment label
  --json                                 Print JSON report
  -h, --help                             Show help

This script is read-only. It never creates users, Supabase rows, queue jobs, workers,
cleanup tasks, or LLM-backed generation.`);
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    mode: 'read-only',
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case '--mode':
        if (next !== 'read-only' && next !== 'mutation-smoke') {
          throw new Error('--mode must be read-only or mutation-smoke');
        }
        parsed.mode = next;
        index += 1;
        break;
      case '--target':
        if (
          next !== 'local' &&
          next !== 'development' &&
          next !== 'dev' &&
          next !== 'staging' &&
          next !== 'production' &&
          next !== 'prod'
        ) {
          throw new Error('--target must be local, development, dev, staging, production, or prod');
        }
        parsed.targetEnvironment = next;
        index += 1;
        break;
      case '--json':
        parsed.json = true;
        break;
      case '-h':
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function exitCodeFor(status: string): number {
  if (status === 'pass' || status === 'warn') return 0;
  if (status === 'blocked') return 2;
  return 1;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await runCareerPlaybookSmokePreflight({
    env: process.env,
    mode: args.mode,
    targetEnvironment: args.targetEnvironment,
  });

  console.log(
    args.json ? JSON.stringify(report, null, 2) : formatCareerPlaybookSmokeReport(report)
  );
  process.exit(exitCodeFor(report.status));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
