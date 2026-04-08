import { useAccount, useConnect, useDisconnect, useBalance, useSwitchChain } from 'wagmi'
import { formatEther } from 'viem'
import { bsc, mainnet, base } from 'wagmi/chains'
import AddressLink from './AddressLink'
import { getChainConfig, SUPPORTED_CHAIN_IDS } from '../config/contracts'

// FIX: 链列表从 SUPPORTED_CHAIN_IDS (contracts.ts CHAIN_CONFIG) 派生，
// 避免与 wagmi.ts 和 contracts.ts 三处独立硬编码导致新增链时遗漏。
// 添加新链时：1) 在 contracts.ts CHAIN_CONFIG 添加配置，2) 在此 map 和 wagmi.ts 的 map 添加 chain 对象。
const WAGMI_CHAIN_MAP: Record<number, typeof bsc> = { 56: bsc, 1: mainnet, 8453: base }
const SUPPORTED_CHAINS = SUPPORTED_CHAIN_IDS
  .filter(id => id in WAGMI_CHAIN_MAP)
  .map(id => WAGMI_CHAIN_MAP[id])

export default function ConnectButton() {
  const { address, isConnected, chain } = useAccount()
  const { connectors, connect, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, error: switchError } = useSwitchChain()
  const { data: balanceData } = useBalance({ address })

  const chainConfig = getChainConfig(chain?.id)

  if (isConnected && address) {
    return (
      <div className="wallet-bar">
        <div className="wallet-info">
          <select
            className="chain-select"
            value={chain?.id ?? 56}
            // FIX: switchChain 可能失败（用户拒绝、钱包不支持），需 catch 防止 unhandled rejection
            onChange={(e) => { switchChain({ chainId: Number(e.target.value) }) }}
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
        {switchError && <div className="hint" style={{ color: '#ff5555', marginTop: 4 }}>Switch failed: {switchError.message}</div>}
      </div>
    )
  }

  // excludeWalletIds 仅控制 AppKit modal，自定义按钮列表需额外过滤
  // FIX: 用 connector.id 代替 connector.name 过滤，id 比 name 更稳定（不受国际化/版本影响）
  const filteredConnectors = connectors.filter(c => c.id !== 'com.okex.wallet')

  return (
    <div className="wallet-bar">
      <div className="connector-list">
        {filteredConnectors.map((connector) => (
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
