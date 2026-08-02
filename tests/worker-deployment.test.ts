import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const deploymentScripts = [
  'scripts/deploy-worker-gcp.ps1',
  'scripts/deploy-worker-gcp.sh',
].map((path) => ({
  path,
  source: readFileSync(join(process.cwd(), path), 'utf8'),
}))

describe.each(deploymentScripts)('$path', ({ source }) => {
  it('fails before building when project billing is disabled', () => {
    expect(source).toContain('billing projects describe')
    expect(source).toContain('billing is not enabled')
  })

  it('keeps an instance warm with CPU available outside requests', () => {
    expect(source).toContain('min-instances')
    expect(source).toContain('--no-cpu-throttling')
  })

  it('preserves existing provider secrets during deployment', () => {
    expect(source).toContain('--update-env-vars')
    expect(source).not.toContain('--set-env-vars')
  })

  it('configures process, readiness, and liveness checks', () => {
    expect(source).toContain('--startup-probe')
    expect(source).toContain('--readiness-probe')
    expect(source).toContain('--liveness-probe')
    expect(source).toContain('/readyz')
  })
})
