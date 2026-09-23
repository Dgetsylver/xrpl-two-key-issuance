import { Client, WalletClient, type Wallet } from 'xrpl'
import { resolveNetwork, type NetworkConfig } from './network.js'

/**
 * Connects a fresh xrpl.js Client to the network selected via XRPL_NETWORK /
 * XRPL_WS_URL. Caller is responsible for disconnecting when done.
 */
export async function connectClient(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ client: Client; network: NetworkConfig }> {
  const network = resolveNetwork(env)
  const client = new Client(network.wsUrl)
  await client.connect()
  return { client, network }
}

/** Scope a signing connection to one local wallet and always release it. */
export async function withWalletClient<T>(
  connection: Client,
  wallet: Wallet,
  use: (client: WalletClient) => Promise<T>,
): Promise<T> {
  const client = new WalletClient(connection.url, { wallet })
  try {
    await client.connect()
    return await use(client)
  } finally {
    await client.disconnect()
  }
}
