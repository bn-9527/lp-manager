import { useAccount, useDisconnect, useBalance, useSwitchChain } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { formatEther } from 'viem'
import type { Chain } from 'wagmi/chains'
import { bsc, mainnet, base, arbitrum } from 'wagmi/chains'
import AddressLink from './AddressLink'
import { getChainConfig, SUPPORTED_CHAIN_IDS } from '../config/contracts'

// FIX: 链列表从 SUPPORTED_CHAIN_IDS (contracts.ts CHAIN_CONFIG) 派生，
// 避免与 wagmi.ts 和 contracts.ts 三处独立硬编码导致新增链时遗漏。
// 添加新链时：1) 在 contracts.ts CHAIN_CONFIG 添加配置，2) 在此 map 和 wagmi.ts 的 map 添加 chain 对象。
// FIX: 用 Chain 而非 typeof bsc，各链的 literal 类型（如 blockExplorers.default.name）互不兼容
const WAGMI_CHAIN_MAP: Record<number, Chain> = { 56: bsc, 1: mainnet, 8453: base, 42161: arbitrum }
const SUPPORTED_CHAINS = SUPPORTED_CHAIN_IDS
  .filter(id => id in WAGMI_CHAIN_MAP)
  .map(id => WAGMI_CHAIN_MAP[id])

export default function ConnectButton() {
  const { address, isConnected, chain } = useAccount()
  const { disconnect } = useDisconnect()
  const { switchChain, error: switchError } = useSwitchChain()
  const { data: balanceData } = useBalance({ address })
  const { open } = useAppKit()

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

  return (
    <div className="wallet-bar">
      <button className="btn btn-connect" onClick={() => open()}>
        Connect Wallet
      </button>
    </div>
  )
}
