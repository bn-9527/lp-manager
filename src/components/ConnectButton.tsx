import { useAccount, useConnect, useDisconnect, useBalance, useSwitchChain } from 'wagmi'
import { formatEther } from 'viem'
import { bsc, mainnet, base } from 'wagmi/chains'
import AddressLink from './AddressLink'
import { getChainConfig } from '../config/contracts'

const SUPPORTED_CHAINS = [bsc, mainnet, base]

export default function ConnectButton() {
  const { address, isConnected, chain } = useAccount()
  const { connectors, connect, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const { data: balanceData } = useBalance({ address })

  const chainConfig = getChainConfig(chain?.id)

  if (isConnected && address) {
    return (
      <div className="wallet-bar">
        <div className="wallet-info">
          <select
            className="chain-select"
            value={chain?.id ?? 56}
            onChange={(e) => switchChain({ chainId: Number(e.target.value) })}
          >
            {SUPPORTED_CHAINS.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <AddressLink chainId={chain?.id} address={address} />
          {balanceData && (
            <span className="balance">
              {parseFloat(formatEther(balanceData.value)).toFixed(4)} {balanceData.symbol}
            </span>
          )}
        </div>
        <div className="wallet-info" style={{ marginTop: 6 }}>
          <span className="contract-label">PositionManager:</span>
          <AddressLink chainId={chain?.id} address={chainConfig.positionManager} />
          <span className="contract-label" style={{ marginLeft: 12 }}>Permit2:</span>
          <AddressLink chainId={chain?.id} address={chainConfig.permit2} />
        </div>
        <button className="btn btn-disconnect" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="wallet-bar">
      <div className="connector-list">
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            className="btn btn-connect"
            disabled={isPending}
            onClick={() => connect({ connector })}
          >
            {isPending ? 'Connecting...' : connector.name}
          </button>
        ))}
      </div>
    </div>
  )
}
