import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CORE_VERSION,
  BatchInputSchema,
  BatchOutput,
  BatchCaseResult,
  runPipeline,
  GeminiFlashClient,
  MockLlmClient,
  ErrorCode,
} from '@ai-prep/core';

interface ParsedArgs {
  inputPath?: string;
  outputPath?: string;
  isEvaluate: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let inputPath: string | undefined;
  let outputPath: string | undefined;
  let isEvaluate = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === 'evaluate') {
      isEvaluate = true;
    } else if (arg === '--input' || arg === '-i') {
      inputPath = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      outputPath = args[++i];
    }
  }

  return { inputPath, outputPath, isEvaluate };
}

export async function runCli(): Promise<void> {
  const { inputPath, outputPath } = parseArgs(process.argv);

  if (!inputPath || !outputPath) {
    console.log(`AI Interview Prep Kit CLI (Core v${CORE_VERSION})`);
    console.log('Usage: npm run evaluate -- --input <cases.json> --output <kits.json>');
    return;
  }

  const resolvedInput = path.resolve(process.cwd(), inputPath);
  const resolvedOutput = path.resolve(process.cwd(), outputPath);

  console.log(`\nStarting batch evaluation...`);
  console.log(`  Input:  ${resolvedInput}`);
  console.log(`  Output: ${resolvedOutput}`);

  let casesRaw: string;
  try {
    casesRaw = await fs.readFile(resolvedInput, 'utf-8');
  } catch (err: any) {
    console.error(`Failed to read input file: ${err.message}`);
    process.exit(1);
  }

  let cases: any[];
  try {
    const parsedJson = JSON.parse(casesRaw);
    cases = BatchInputSchema.parse(parsedJson);
  } catch (err: any) {
    console.error(`Input file failed schema validation: ${err.message}`);
    process.exit(1);
  }

  console.log(`Found ${cases.length} evaluation case(s).\n`);

  const results: BatchCaseResult[] = [];
  const llm = process.env.GEMINI_API_KEY ? new GeminiFlashClient() : new MockLlmClient();

  for (let idx = 0; idx < cases.length; idx++) {
    const c = cases[idx];
    console.log(`[${idx + 1}/${cases.length}] Processing "${c.id}" (${c.days} days, URL: ${c.company_url || 'none'})...`);

    try {
      const kit = await runPipeline(
        {
          jd: c.jd,
          company_url: c.company_url,
          days: c.days,
        },
        {
          llm,
          policy: 'allow-local', // Permit local URLs for evaluation
        },
        {
          onProgress: (p) => {
            console.log(`  → [${c.id}] ${p.stage} (${p.percent}%): ${p.message}`);
          },
          onWarning: (w) => {
            console.warn(`  ⚠ [${c.id}] Warning: ${w}`);
          },
        }
      );

      results.push({
        id: c.id,
        status: 'ok',
        kit,
        error: null,
      });

      console.log(`  ✓ [${c.id}] Completed successfully (${kit.questions.length} questions, ${kit.schedule.days.length} days).\n`);
    } catch (err: any) {
      let code: ErrorCode = 'PIPELINE_FAILED';
      if (err.message?.includes('COMPANY_UNREACHABLE')) code = 'COMPANY_UNREACHABLE';
      if (err.message?.includes('JD_EMPTY')) code = 'INPUT_TOO_THIN';
      if (err.message?.includes('RATE_LIMIT')) code = 'LLM_RATE_LIMITED';

      console.error(`  ✗ [${c.id}] FAILED: ${err.message}\n`);

      results.push({
        id: c.id,
        status: 'failed',
        kit: null,
        error: {
          code,
          message: err.message || 'Unknown generation failure',
        },
      });
    }
  }

  const output: BatchOutput = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    kits: results,
  };

  const outputDir = path.dirname(resolvedOutput);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(resolvedOutput, JSON.stringify(output, null, 2), 'utf-8');

  const okCount = results.filter((r) => r.status === 'ok').length;
  const failCount = results.length - okCount;
  console.log(`\n========================================`);
  console.log(`Batch evaluation finished!`);
  console.log(`Total: ${cases.length} | Passed: ${okCount} | Failed: ${failCount}`);
  console.log(`Saved output to: ${resolvedOutput}`);
  console.log(`========================================\n`);
}

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  runCli().catch((err) => {
    console.error('Fatal CLI error:', err);
    process.exit(1);
  });
}
