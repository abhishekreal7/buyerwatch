import { spawnSync } from 'node:child_process'

const stages = [
  ['typecheck', 'npm run typecheck'],
  ['lint', 'npm run lint'],
  ['test', 'npm test'],
  ['audit', 'npm audit --audit-level=high'],
  ['build', 'npm run build'],
]

const results = []
for (const [name, command] of stages) {
  console.log(`\n=== verify:${name} ===`)
  const result = spawnSync(command, {
    cwd: process.cwd(),
    env: process.env,
    shell: true,
    stdio: 'inherit',
  })
  results.push({ name, exitCode: result.status ?? 1 })
}

console.log('\n=== verification summary ===')
for (const result of results) {
  console.log(`${result.exitCode === 0 ? 'PASS' : 'FAIL'} ${result.name}`)
}

if (results.some(result => result.exitCode !== 0)) process.exit(1)
