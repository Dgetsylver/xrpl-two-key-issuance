import type { Client } from 'xrpl'
import { connectClient } from '../lib/client.js'
import { loadDeploymentState, type AccountState } from '../lib/config.js'

async function printAccountStatus(client: Client, label: string, account: AccountState, mptIssuanceId?: string): Promise<void> {
  console.log(`\n${label}: ${account.address}`)

  const signerLists = await client.request({ command: 'account_objects', account: account.address, type: 'signer_list' })
  const signerList = signerLists.result.account_objects[0] as
    | { SignerQuorum?: number; SignerEntries?: Array<{ SignerEntry: { Account: string } }> }
    | undefined
  if (signerList) {
    const entries = (signerList.SignerEntries ?? []).map((e) => e.SignerEntry.Account)
    console.log(`  SignerList: quorum ${signerList.SignerQuorum} of [${entries.join(', ')}]`)
  } else {
    console.log('  SignerList: none configured')
  }

  const accountInfo = await client.request({ command: 'account_info', account: account.address })
  const masterKeyDisabled = accountInfo.result.account_flags?.disableMasterKey ?? false
  console.log(`  Master key disabled: ${masterKeyDisabled}`)

  if (mptIssuanceId) {
    const mptObjects = await client.request({ command: 'account_objects', account: account.address, type: 'mptoken' })
    const mptoken = mptObjects.result.account_objects.find(
      (o) => (o as { MPTokenIssuanceID?: string }).MPTokenIssuanceID === mptIssuanceId,
    ) as { MPTAmount?: string } | undefined
    console.log(`  MPT balance: ${mptoken?.MPTAmount ?? '(not authorized / no balance)'}`)
  }
}

async function main(): Promise<void> {
  const state = loadDeploymentState()
  const { client, network } = await connectClient()
  try {
    console.log(`Connected to ${network.name} (${network.wsUrl}).`)

    if (state.mptIssuanceId) {
      const issuance = await client.request({ command: 'ledger_entry', mpt_issuance: state.mptIssuanceId })
      const node = issuance.result.node as {
        OutstandingAmount?: string
        Flags?: number
        MaximumAmount?: string
      }
      console.log(`\nMPTokenIssuance: ${state.mptIssuanceId}`)
      console.log(`  Outstanding amount: ${node.OutstandingAmount}`)
      console.log(`  Flags: ${node.Flags}`)
      console.log(`  Maximum amount: ${node.MaximumAmount ?? '(default cap, 2^63-1)'}`)
    } else {
      console.log('\nNo MPT issuance yet. Run `npm run setup:issuer`.')
    }

    if (state.issuer) {
      await printAccountStatus(client, 'Issuer', state.issuer)
    } else {
      console.log('\nNo issuer yet. Run `npm run setup:issuer`.')
    }

    if (state.governance) {
      await printAccountStatus(client, 'Governance', state.governance, state.mptIssuanceId)
    } else {
      console.log('\nNo governance account yet. Run `npm run setup:governance`.')
    }

    if (state.mintedPeriods?.length) {
      console.log(`\nMinted periods on record: ${state.mintedPeriods.join(', ')}`)
    }
  } finally {
    await client.disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
