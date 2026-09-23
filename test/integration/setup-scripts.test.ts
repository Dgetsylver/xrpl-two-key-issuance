import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client, MPTokenFlags, fetchMPTokenIssuance, fetchMPTokenOrUndefined } from 'xrpl'
import { isMasterKeyDisabled } from '../../src/lib/bootstrap.js'
import type { DeploymentState } from '../../src/lib/config.js'
import { startLocalNetwork, type LocalNetworkHandle } from '../helpers/localNetwork.js'
import { requireAuthEnv, testEnv } from '../helpers/fixtures.js'

const run = promisify(execFile)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const tsx = path.join(repoRoot, 'node_modules', '.bin', 'tsx')

/**
 * Runs one of the npm scripts' entry points as its own process, in `cwd`
 * (where it reads and writes .deployment.json; there's no .env there).
 * execFile is asynchronous, so this process keeps advancing the ledger.
 */
async function runScript(name: string, cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await run(tsx, [path.join(repoRoot, 'src/scripts', `${name}.ts`)], { cwd, env })
  return stdout
}

function readState(cwd: string): DeploymentState {
  return JSON.parse(readFileSync(path.join(cwd, '.deployment.json'), 'utf-8')) as DeploymentState
}

describe('setup scripts', () => {
  let network: LocalNetworkHandle
  let client: Client
  const dirs: string[] = []

  function workDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'carbon-coin-setup-'))
    dirs.push(dir)
    return dir
  }

  beforeAll(async () => {
    network = await startLocalNetwork()
    client = new Client(network.wsUrl)
    await client.connect()
  })

  afterAll(async () => {
    await client?.disconnect()
    await network?.teardown()
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  })

  it('with RequireAuth, keeps the issuer master key until setup:governance admits governance', async () => {
    const cwd = workDir()
    const env = requireAuthEnv(network.wsUrl)

    await runScript('setup-issuer', cwd, env)
    const afterIssuer = readState(cwd)
    expect(afterIssuer.issuance).toEqual({ flags: 102, assetScale: 3 })
    expect(afterIssuer.issuer?.masterKeyDisablePending).toBe(true)
    expect(await isMasterKeyDisabled(client, afterIssuer.issuer!.address)).toBe(false)

    // A rerun changes nothing and says what's left to do.
    const rerun = await runScript('setup-issuer', cwd, env)
    expect(rerun).toMatch(/already set up/)
    expect(rerun).toMatch(/setup:governance/)
    expect(readState(cwd)).toEqual(afterIssuer)

    await runScript('setup-governance', cwd, env)
    const done = readState(cwd)
    expect(done.issuer?.masterKeyDisablePending).toBeUndefined()
    expect(done.governance?.masterKeyDisablePending).toBeUndefined()
    expect(await isMasterKeyDisabled(client, done.issuer!.address)).toBe(true)
    expect(await isMasterKeyDisabled(client, done.governance!.address)).toBe(true)
    const holding = await fetchMPTokenOrUndefined(client, done.governance!.address, done.mptIssuanceId!, 'validated')
    expect((holding?.Flags ?? 0) & MPTokenFlags.lsfMPTAuthorized).not.toBe(0)

    expect(await runScript('setup-governance', cwd, env)).toMatch(/Governance already set up/)

    const status = await runScript('status', cwd, env)
    expect(status).toMatch(/RequireAuth: yes/)
    expect(status).toMatch(/AssetScale: 3/)
    expect(status).toMatch(/Admitted by the issuer: yes/)
    expect(status).toMatch(/Both master keys disabled: yes/)
  }, 180_000)

  it('resumes an interrupted issuer setup without creating a second issuance', async () => {
    const cwd = workDir()
    const env = requireAuthEnv(network.wsUrl)

    await runScript('setup-issuer', cwd, env)
    const complete = readState(cwd)

    // As if the run had stopped right after MPTokenIssuanceCreate, before
    // anything about the issuance was saved.
    const { mptIssuanceId: _id, issuance: _issuance, ...interrupted } = complete
    writeFileSync(path.join(cwd, '.deployment.json'), JSON.stringify(interrupted, null, 2))

    const resumed = await runScript('setup-issuer', cwd, env)
    expect(resumed).toMatch(/Found the existing MPT issuance/)
    expect(readState(cwd)).toEqual(complete)
  }, 180_000)

  it('without RequireAuth, disables each master key in its own script as before', async () => {
    const cwd = workDir()
    const env = testEnv(network.wsUrl)

    await runScript('setup-issuer', cwd, env)
    const afterIssuer = readState(cwd)
    expect(afterIssuer.issuance).toEqual({ flags: 98, assetScale: 0 })
    expect(afterIssuer.issuer?.masterKeyDisablePending).toBeUndefined()
    expect(await isMasterKeyDisabled(client, afterIssuer.issuer!.address)).toBe(true)
    const node = await fetchMPTokenIssuance(client, afterIssuer.mptIssuanceId!, 'validated')
    expect(node.AssetScale).toBeUndefined()

    await runScript('setup-governance', cwd, env)
    const done = readState(cwd)
    expect(await isMasterKeyDisabled(client, done.governance!.address)).toBe(true)
    const holding = await fetchMPTokenOrUndefined(client, done.governance!.address, done.mptIssuanceId!, 'validated')
    expect(holding?.Flags).toBe(0)

    const status = await runScript('status', cwd, env)
    expect(status).toMatch(/RequireAuth: no/)
    expect(status).toMatch(/Admitted by the issuer: not required/)
    expect(status).toMatch(/Both master keys disabled: yes/)
  }, 180_000)
})
