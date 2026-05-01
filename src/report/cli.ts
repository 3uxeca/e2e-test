import { generateReport } from './generator.js';

function main() {
  const arg = process.argv[2];
  const result = generateReport({ runId: arg });
  console.log(`[report] generated ${result.outputPath} (runId=${result.runId})`);
}

main();
