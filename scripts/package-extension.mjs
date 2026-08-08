import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, zipSync } from 'fflate'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = join(root, 'browser-extension')
const outputPath = join(root, 'public', 'buyerwatch-extension.zip')
const developmentRoot = join(root, 'tmp', 'buyerwatch-extension-dev')
const deterministicMtime = new Date('2026-01-01T00:00:00.000Z')

const packagedFiles = [
  'README.md',
  'background.js',
  'common.js',
  'content.js',
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
  'manifest.json',
  'options.css',
  'options.html',
  'options.js',
  'popup.css',
  'popup.html',
  'popup.js',
]

const developmentFiles = [
  ...packagedFiles.filter(file => file !== 'manifest.json'),
  'bridge.js',
]

function fail(message) {
  console.error(`[extension] ${message}`)
  process.exitCode = 1
}

function validateManifest(manifest) {
  const expectedPermissions = JSON.stringify(['activeTab', 'storage'])
  if (manifest.manifest_version !== 3) throw new Error('Manifest V3 is required')
  if (manifest.version !== '1.0.0') throw new Error('Release manifest must be version 1.0.0')
  if (JSON.stringify(manifest.permissions) !== expectedPermissions) {
    throw new Error('Production permissions must remain activeTab and storage only')
  }
  const hosts = manifest.host_permissions ?? []
  if (hosts.some(host => /localhost|127\.0\.0\.1|\*\.supabase\.co/i.test(host))) {
    throw new Error('Production host permissions contain a development or wildcard service host')
  }
  if (!hosts.includes('https://nenarlpygxtkdxbjqrtb.supabase.co/*')) {
    throw new Error('Production manifest is missing the exact BuyerWatch auth host')
  }
  for (const script of manifest.content_scripts ?? []) {
    if (script.js?.[0] !== 'common.js') {
      throw new Error('common.js must load before every extension content script')
    }
  }
  if (manifest.background?.service_worker !== 'background.js') {
    throw new Error('Production external messaging must use background.js')
  }
  if (manifest.incognito !== 'not_allowed') {
    throw new Error('Production extension must be disabled in incognito')
  }
  const externalMatches = manifest.externally_connectable?.matches ?? []
  if (JSON.stringify(externalMatches) !== JSON.stringify([
    'https://buyerwatch.co/*',
    'https://www.buyerwatch.co/*',
  ])) {
    throw new Error('External messaging must be restricted to BuyerWatch production origins')
  }
  if ((manifest.content_scripts ?? []).some(script => (
    script.matches ?? []
  ).some(match => match.endsWith('reddit.com/*')))) {
    throw new Error('Reddit content scripts must be restricted to conversation paths')
  }
}

function validateSources() {
  const sourceFiles = [...new Set([
    ...packagedFiles,
    ...developmentFiles,
    'manifest.development.json',
  ])]
  for (const file of sourceFiles) {
    const path = join(sourceRoot, file)
    if (!existsSync(path)) throw new Error(`Missing packaged source: ${file}`)
    if (file.endsWith('.js')) {
      execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' })
    }
  }
  validateManifest(JSON.parse(readFileSync(join(sourceRoot, 'manifest.json'), 'utf8')))
  const developmentManifest = JSON.parse(
    readFileSync(join(sourceRoot, 'manifest.development.json'), 'utf8'),
  )
  if (!developmentManifest.host_permissions?.includes('http://localhost:3000/*')) {
    throw new Error('Development manifest must include localhost')
  }
  if (developmentManifest.background?.service_worker !== 'background.js') {
    throw new Error('Development external messaging must use background.js')
  }
}

function buildArchive() {
  const entries = Object.fromEntries(packagedFiles.map(file => [
    file,
    [new Uint8Array(readFileSync(join(sourceRoot, file))), { mtime: deterministicMtime }],
  ]))
  return Buffer.from(zipSync(entries, { level: 9 }))
}

function checkArchive(expected) {
  if (!existsSync(outputPath)) {
    fail('Production ZIP is missing. Run npm run extension:package.')
    return
  }
  const actual = readFileSync(outputPath)
  if (!actual.equals(expected)) {
    fail('Production ZIP is stale. Run npm run extension:package and commit the result.')
    return
  }

  const unpacked = unzipSync(new Uint8Array(actual))
  const actualFiles = Object.keys(unpacked).sort()
  const expectedFiles = [...packagedFiles].sort()
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    fail('Production ZIP contains missing or unexpected files.')
    return
  }
  for (const file of expectedFiles) {
    const source = readFileSync(join(sourceRoot, file))
    if (!Buffer.from(unpacked[file]).equals(source)) {
      fail(`Production ZIP does not match source: ${file}`)
      return
    }
  }
  console.log(`[extension] Verified ${expectedFiles.length} packaged files and deterministic ZIP parity.`)
}

function assertGeneratedTarget(path) {
  const allowedRoot = resolve(root, 'tmp') + sep
  const target = resolve(path)
  if (!target.startsWith(allowedRoot) || target === resolve(root, 'tmp')) {
    throw new Error(`Refusing to replace unsafe development target: ${target}`)
  }
  return target
}

function buildDevelopmentDirectory() {
  const target = assertGeneratedTarget(developmentRoot)
  rmSync(target, { force: true, recursive: true })
  for (const file of developmentFiles) {
    const destination = join(target, file)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(join(sourceRoot, file), destination)
  }
  copyFileSync(join(sourceRoot, 'manifest.development.json'), join(target, 'manifest.json'))
  console.log(`[extension] Development build ready at ${relative(root, target)}.`)
}

validateSources()

if (process.argv.includes('--development')) {
  buildDevelopmentDirectory()
} else {
  const archive = buildArchive()
  if (process.argv.includes('--check')) {
    checkArchive(archive)
  } else {
    writeFileSync(outputPath, archive)
    checkArchive(archive)
    console.log(`[extension] Wrote ${relative(root, outputPath)} (${archive.length} bytes).`)
  }
}
