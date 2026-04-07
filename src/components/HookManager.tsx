import { useState, useEffect, useCallback } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { isAddress, type Address, type Hex } from 'viem'
import { HOOK_CONFIGS, type HookProtocol } from '../config/hooks'
import { explorerTx } from '../config/contracts'
import AddressLink from './AddressLink'
import { calculateSqrtPriceX96 } from '../utils/sqrtPrice'
import { feeToTickSpacing } from '../utils/encoder'

export default function HookManager() {
  const { address, isConnected, chain } = useAccount()
  const chainId = chain?.id

  // Protocol sub-tab
  const [protocol, setProtocol] = useState<HookProtocol>('uni-v4')
  const config = HOOK_CONFIGS[protocol]

  // Hook address — prefilled from config defaults
  const [hookAddress, setHookAddress] = useState('')
  useEffect(() => {
    const addr = (chainId && config.defaultAddresses[chainId]) || ''
    setHookAddress(addr)
  }, [protocol, chainId, config])

  const validHook = isAddress(hookAddress)

  // Auto-read hook info
  const { data: hookOwner } = useReadContract({
    address: validHook ? (hookAddress as Address) : undefined,
    abi: config.abi, functionName: 'owner',
    query: { enabled: validHook },
  })
  const { data: pendingOwner } = useReadContract({
    address: validHook ? (hookAddress as Address) : undefined,
    abi: config.abi, functionName: 'pendingOwner',
    query: { enabled: validHook },
  })
  const { data: hookPositionManager } = useReadContract({
    address: validHook ? (hookAddress as Address) : undefined,
    abi: config.abi, functionName: 'positionManager',
    query: { enabled: validHook },
  })

  const isOwner = !!address && !!hookOwner && (hookOwner as string).toLowerCase() === address.toLowerCase()
  const isPendingOwner = !!address && !!pendingOwner && (pendingOwner as string).toLowerCase() === address.toLowerCase()

  // Pool params — shared across all operation panels
  const [token0, setToken0] = useState('')
  const [token1, setToken1] = useState('')
  const [fee, setFee] = useState('500')
  const [tickSpacing, setTickSpacing] = useState('10')
  useEffect(() => {
    const f = parseInt(fee)
    if (f > 0) setTickSpacing(String(feeToTickSpacing(f)))
  }, [fee])

  const poolParamsValid = isAddress(token0) && isAddress(token1) && parseInt(fee) > 0 && parseInt(tickSpacing) > 0

  // Read poolId from contract
  const { data: poolId, refetch: refetchPoolId } = useReadContract({
    address: validHook ? (hookAddress as Address) : undefined,
    abi: config.abi, functionName: 'getPoolId',
    args: poolParamsValid ? [token0 as Address, token1 as Address, parseInt(fee), parseInt(tickSpacing)] : undefined,
    query: { enabled: validHook && poolParamsValid },
  })

  // Read pool status (only when poolId is available)
  const poolIdHex = poolId as Hex | undefined
  const hasPoolId = !!poolIdHex

  const { data: isPoolEnabled, refetch: refetchEnabled } = useReadContract({
    address: validHook ? (hookAddress as Address) : undefined,
    abi: config.abi, functionName: 'isPoolEnabled',
    args: hasPoolId ? [poolIdHex!] : undefined,
    query: { enabled: validHook && hasPoolId },
  })
  const { data: isPoolStarted, refetch: refetchStarted } = useReadContract({
    address: validHook ? (hookAddress as Address) : undefined,
    abi: config.abi, functionName: 'isPoolStarted',
    args: hasPoolId ? [poolIdHex!] : undefined,
    query: { enabled: validHook && hasPoolId },
  })
  const { data: poolTimestamp, refetch: refetchTimestamp } = useReadContract({
    address: validHook ? (hookAddress as Address) : undefined,
    abi: config.abi, functionName: 'poolStartedTimestamp',
    args: hasPoolId ? [poolIdHex!] : undefined,
    query: { enabled: validHook && hasPoolId },
  })
  const { data: poolOwners, refetch: refetchOwners } = useReadContract({
    address: validHook ? (hookAddress as Address) : undefined,
    abi: config.abi, functionName: 'getPoolOwners',
    args: hasPoolId ? [poolIdHex!] : undefined,
    query: { enabled: validHook && hasPoolId },
  })

  const refetchPoolStatus = useCallback(() => {
    refetchPoolId()
    refetchEnabled()
    refetchStarted()
    refetchTimestamp()
    refetchOwners()
  }, [refetchPoolId, refetchEnabled, refetchStarted, refetchTimestamp, refetchOwners])

  // Transaction state
  const [txHash, setTxHash] = useState<Hex | undefined>()
  const [txError, setTxError] = useState<string | null>(null)
  const { writeContractAsync } = useWriteContract()
  const { isLoading: isTxConfirming, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash: txHash })

  const resetTx = useCallback(() => {
    setTxHash(undefined)
    setTxError(null)
  }, [])

  // Collapsible sections
  const [expanded, setExpanded] = useState<string | null>(null)
  const toggleSection = (s: string) => setExpanded(prev => prev === s ? null : s)

  // --- Initialize Pool ---
  const [initPrice, setInitPrice] = useState('600')
  const [initTimestamp, setInitTimestamp] = useState('')
  const [initDatetime, setInitDatetime] = useState('')

  const handleInitDatetimeChange = (val: string) => {
    setInitDatetime(val)
    if (val) {
      const ts = Math.floor(new Date(val + 'Z').getTime() / 1000)
      if (!isNaN(ts)) setInitTimestamp(String(ts))
    }
  }
  const handleInitTimestampChange = (val: string) => {
    setInitTimestamp(val)
    const ts = parseInt(val)
    if (!isNaN(ts) && ts > 0) {
      const d = new Date(ts * 1000)
      setInitDatetime(d.toISOString().slice(0, 16))
    }
  }

  // --- CL-specific: read poolManager for initializePool ---
  const { data: clPoolManager } = useReadContract({
    address: validHook && protocol === 'pcs-cl' ? (hookAddress as Address) : undefined,
    abi: HOOK_CONFIGS['pcs-cl'].abi,
    functionName: 'poolManager',
    query: { enabled: validHook && protocol === 'pcs-cl' },
  })

  const { data: clPoolKeyParameters } = useReadContract({
    address: validHook && protocol === 'pcs-cl' ? (hookAddress as Address) : undefined,
    abi: HOOK_CONFIGS['pcs-cl'].abi,
    functionName: 'getPoolKeyParameters',
    args: parseInt(tickSpacing) > 0 ? [parseInt(tickSpacing)] : undefined,
    query: { enabled: validHook && protocol === 'pcs-cl' && parseInt(tickSpacing) > 0 },
  })

  async function handleInitializePool() {
    if (!validHook || !poolParamsValid) return
    resetTx()
    try {
      const ts = BigInt(initTimestamp)
      if (ts <= 0n) throw new Error('Invalid timestamp')
      const p = parseFloat(initPrice)
      if (!(p > 0)) throw new Error('Invalid price')
      const t0 = token0.toLowerCase() < token1.toLowerCase() ? token0 : token1
      const t1 = t0 === token0 ? token1 : token0
      const result = calculateSqrtPriceX96(t0, t1, 18, 18, 'T0', 'T1', initPrice)
      if (!result || result.sqrtPriceX96 <= 0n) throw new Error('Failed to calculate sqrtPriceX96')

      if (protocol === 'pcs-cl') {
        if (!clPoolManager || !clPoolKeyParameters) throw new Error('CL poolManager or parameters not loaded')
        const hash = await writeContractAsync({
          address: hookAddress as Address,
          abi: config.abi,
          functionName: 'initializePool',
          args: [
            {
              currency0: t0 as Address,
              currency1: t1 as Address,
              hooks: hookAddress as Address,
              poolManager: clPoolManager as Address,
              fee: parseInt(fee),
              parameters: clPoolKeyParameters as Hex,
            },
            ts,
            result.sqrtPriceX96,
          ],
        })
        setTxHash(hash)
      } else {
        const hash = await writeContractAsync({
          address: hookAddress as Address,
          abi: config.abi,
          functionName: 'initializePool',
          args: [
            {
              currency0: t0 as Address,
              currency1: t1 as Address,
              fee: parseInt(fee),
              tickSpacing: parseInt(tickSpacing),
              hooks: hookAddress as Address,
            },
            ts,
            result.sqrtPriceX96,
          ],
        })
        setTxHash(hash)
      }
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setTxError(e?.shortMessage || e?.message || 'Initialize failed')
    }
  }

  // --- Whitelist Management ---
  const [newOwners, setNewOwners] = useState('')
  const [removeChecked, setRemoveChecked] = useState<Set<string>>(new Set())

  async function handleAddOwners() {
    if (!validHook || !poolIdHex) return
    resetTx()
    try {
      const addrs = newOwners.split(/[,\n\s]+/).map(s => s.trim()).filter(s => isAddress(s))
      if (addrs.length === 0) throw new Error('No valid addresses')
      const hash = await writeContractAsync({
        address: hookAddress as Address, abi: config.abi, functionName: 'addPoolOwners',
        args: [poolIdHex, addrs as Address[]],
      })
      setTxHash(hash)
      setNewOwners('')
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setTxError(e?.shortMessage || e?.message || 'Add owners failed')
    }
  }

  async function handleRemoveOwners() {
    if (!validHook || !poolIdHex || removeChecked.size === 0) return
    resetTx()
    try {
      const hash = await writeContractAsync({
        address: hookAddress as Address, abi: config.abi, functionName: 'removePoolOwners',
        args: [poolIdHex, Array.from(removeChecked) as Address[]],
      })
      setTxHash(hash)
      setRemoveChecked(new Set())
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setTxError(e?.shortMessage || e?.message || 'Remove owners failed')
    }
  }

  // --- Set Pool Start Time ---
  const [newStartTimestamp, setNewStartTimestamp] = useState('')
  const [newStartDatetime, setNewStartDatetime] = useState('')

  const handleStartDatetimeChange = (val: string) => {
    setNewStartDatetime(val)
    if (val) {
      const ts = Math.floor(new Date(val + 'Z').getTime() / 1000)
      if (!isNaN(ts)) setNewStartTimestamp(String(ts))
    }
  }
  const handleStartTimestampChange = (val: string) => {
    setNewStartTimestamp(val)
    const ts = parseInt(val)
    if (!isNaN(ts) && ts > 0) {
      const d = new Date(ts * 1000)
      setNewStartDatetime(d.toISOString().slice(0, 16))
    }
  }

  async function handleSetStartTime() {
    if (!validHook || !poolIdHex) return
    resetTx()
    try {
      const ts = BigInt(newStartTimestamp)
      if (ts <= 0n) throw new Error('Invalid timestamp')
      const hash = await writeContractAsync({
        address: hookAddress as Address, abi: config.abi, functionName: 'setPoolStartTime',
        args: [poolIdHex, ts],
      })
      setTxHash(hash)
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setTxError(e?.shortMessage || e?.message || 'Set start time failed')
    }
  }

  // --- Set Position Manager ---
  const [newPosManager, setNewPosManager] = useState('')

  async function handleSetPositionManager() {
    if (!validHook) return
    resetTx()
    try {
      if (!isAddress(newPosManager)) throw new Error('Invalid address')
      const hash = await writeContractAsync({
        address: hookAddress as Address, abi: config.abi, functionName: 'setPositionManager',
        args: [newPosManager as Address],
      })
      setTxHash(hash)
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setTxError(e?.shortMessage || e?.message || 'Set position manager failed')
    }
  }

  // --- Emergency Withdraw ---
  const [withdrawType, setWithdrawType] = useState<'safe' | 'unsafe' | 'erc721'>('safe')
  const [withdrawToken, setWithdrawToken] = useState('')
  const [withdrawTokenId, setWithdrawTokenId] = useState('')

  async function handleEmergencyWithdraw() {
    if (!validHook) return
    resetTx()
    try {
      if (!isAddress(withdrawToken)) throw new Error('Invalid token address')
      let hash: Hex
      if (withdrawType === 'safe') {
        hash = await writeContractAsync({
          address: hookAddress as Address, abi: config.abi,
          functionName: 'emergencyWithdraw', args: [withdrawToken as Address],
        })
      } else if (withdrawType === 'unsafe') {
        hash = await writeContractAsync({
          address: hookAddress as Address, abi: config.abi,
          functionName: 'emergencyWithdrawERC20Unsafe', args: [withdrawToken as Address],
        })
      } else {
        if (!withdrawTokenId) throw new Error('Token ID required')
        hash = await writeContractAsync({
          address: hookAddress as Address, abi: config.abi,
          functionName: 'emergencyWithdrawERC721', args: [withdrawToken as Address, BigInt(withdrawTokenId)],
        })
      }
      setTxHash(hash)
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setTxError(e?.shortMessage || e?.message || 'Emergency withdraw failed')
    }
  }

  // --- Ownership Transfer ---
  const [newOwnerAddr, setNewOwnerAddr] = useState('')

  async function handleTransferOwnership() {
    if (!validHook) return
    resetTx()
    try {
      if (!isAddress(newOwnerAddr)) throw new Error('Invalid address')
      const hash = await writeContractAsync({
        address: hookAddress as Address, abi: config.abi,
        functionName: 'transferOwnership', args: [newOwnerAddr as Address],
      })
      setTxHash(hash)
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setTxError(e?.shortMessage || e?.message || 'Transfer ownership failed')
    }
  }

  async function handleAcceptOwnership() {
    if (!validHook) return
    resetTx()
    try {
      const hash = await writeContractAsync({
        address: hookAddress as Address, abi: config.abi,
        functionName: 'acceptOwnership', args: [],
      })
      setTxHash(hash)
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string }
      setTxError(e?.shortMessage || e?.message || 'Accept ownership failed')
    }
  }

  // Auto-refresh pool status after tx confirmation
  useEffect(() => {
    if (isTxConfirmed) refetchPoolStatus()
  }, [isTxConfirmed, refetchPoolStatus])

  if (!isConnected) {
    return <div className="card"><p style={{ textAlign: 'center', color: '#666' }}>Connect your wallet to manage hooks</p></div>
  }

  const ownersList = (poolOwners as string[] | undefined) ?? []
  const timestampNum = poolTimestamp ? Number(poolTimestamp) : 0
  const timestampDisplay = timestampNum > 0 ? new Date(timestampNum * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : 'Not set'

  function CollapsibleSection({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
    const isOpen = expanded === id
    return (
      <div>
        <div className="collapsible-header" onClick={() => toggleSection(id)}>
          <span className="section-label">{label}</span>
          <span className={`toggle-icon ${isOpen ? 'open' : ''}`}>&#9654;</span>
        </div>
        {isOpen && <div className="collapsible-body">{children}</div>}
      </div>
    )
  }

  function TxStatus() {
    if (!txHash) return null
    return (
      <div className={`status-box ${isTxConfirmed ? 'success' : 'pending'}`}>
        Tx: <a href={explorerTx(chainId, txHash)} target="_blank" rel="noreferrer">
          {txHash.slice(0, 10)}...{txHash.slice(-8)}
        </a>
        {isTxConfirming && ' (confirming...)'}
        {isTxConfirmed && ' (confirmed)'}
      </div>
    )
  }

  return (
    <div className="card">
      <div className="section-title">Hook Manager</div>

      {/* Protocol sub-tabs */}
      <div className="hook-sub-tabs">
        {(Object.keys(HOOK_CONFIGS) as HookProtocol[]).map(p => (
          <button key={p} className={protocol === p ? 'active' : ''} onClick={() => setProtocol(p)}>
            {HOOK_CONFIGS[p].label}
          </button>
        ))}
      </div>

      {/* Hook address */}
      <div className="form-group">
        <label>Hook Address</label>
        <div className="input-with-link">
          <input value={hookAddress} onChange={e => setHookAddress(e.target.value)} placeholder="0x..." />
          {validHook && <AddressLink chainId={chainId} address={hookAddress} label="view" />}
        </div>
      </div>

      {/* Hook info */}
      {validHook && (
        <>
          <div className="hook-info-row">
            <span className="info-label">Owner:</span>
            <span className="info-value">{hookOwner ? (hookOwner as string) : '...'}</span>
            {isOwner && <span className="token-badge" style={{ background: '#50fa7b' }}>YOU</span>}
          </div>
          <div className="hook-info-row">
            <span className="info-label">Position Manager:</span>
            <span className="info-value">{hookPositionManager ? (hookPositionManager as string) : '...'}</span>
          </div>
          {pendingOwner && (pendingOwner as string) !== '0x0000000000000000000000000000000000000000' && (
            <div className="hook-info-row">
              <span className="info-label">Pending Owner:</span>
              <span className="info-value" style={{ color: '#ffb74d' }}>{pendingOwner as string}</span>
              {isPendingOwner && <span className="token-badge" style={{ background: '#ffb74d', color: '#000' }}>YOU</span>}
            </div>
          )}
        </>
      )}

      <hr className="divider" />

      {/* Pool params — shared by all panels */}
      <div className="section-title" style={{ fontSize: 14 }}>Pool Parameters</div>
      <div className="form-group">
        <label>Token 0</label>
        <input value={token0} onChange={e => setToken0(e.target.value)} placeholder="0x..." />
      </div>
      <div className="form-group">
        <label>Token 1</label>
        <input value={token1} onChange={e => setToken1(e.target.value)} placeholder="0x..." />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Fee (bips)</label>
          <input value={fee} onChange={e => setFee(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Tick Spacing</label>
          <input value={tickSpacing} onChange={e => setTickSpacing(e.target.value)} />
        </div>
      </div>
      {poolIdHex && (
        <div className="hook-info-row" style={{ marginBottom: 12 }}>
          <span className="info-label">Pool ID:</span>
          <span className="info-value" style={{ fontSize: 11 }}>{poolIdHex}</span>
        </div>
      )}

      <hr className="divider" />

      {/* 1. Initialize Pool */}
      <CollapsibleSection id="init" label="Initialize Pool">
        <div className="form-group">
          <label>Price (Token1 per Token0)</label>
          <input value={initPrice} onChange={e => setInitPrice(e.target.value)} placeholder="600" />
        </div>
        <div className="form-group">
          <label>Start Time (UTC)</label>
          <input type="datetime-local" value={initDatetime} onChange={e => handleInitDatetimeChange(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Unix Timestamp</label>
          <input value={initTimestamp} onChange={e => handleInitTimestampChange(e.target.value)} placeholder="e.g. 1712500000" />
        </div>
        <button
          className="btn btn-primary"
          disabled={!isOwner || !poolParamsValid || !initTimestamp}
          onClick={handleInitializePool}
        >
          {!isOwner ? 'Not Hook Owner' : 'Initialize Pool'}
        </button>
      </CollapsibleSection>

      {/* 2. Pool Status */}
      <CollapsibleSection id="status" label="Pool Status">
        {!hasPoolId ? (
          <div className="hint">Enter valid pool parameters above to query status</div>
        ) : (
          <>
            <div className="pool-status-grid">
              <div className="pool-status-item">
                <div className="ps-label">Enabled</div>
                <div className={`ps-value ${isPoolEnabled ? '' : 'false'}`}>
                  {isPoolEnabled === undefined ? '...' : String(isPoolEnabled)}
                </div>
              </div>
              <div className="pool-status-item">
                <div className="ps-label">Started</div>
                <div className={`ps-value ${isPoolStarted ? '' : 'false'}`}>
                  {isPoolStarted === undefined ? '...' : String(isPoolStarted)}
                </div>
              </div>
              <div className="pool-status-item" style={{ gridColumn: '1 / -1' }}>
                <div className="ps-label">Start Timestamp</div>
                <div className="ps-value">{timestampDisplay}{timestampNum > 0 && ` (${timestampNum})`}</div>
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <div className="ps-label" style={{ marginBottom: 4, color: '#888', fontSize: 11 }}>
                Pool Owners ({ownersList.length})
              </div>
              {ownersList.length === 0 && <div className="hint">No pool owners</div>}
              {ownersList.map((addr, i) => (
                <div key={i} className="whitelist-item">
                  <AddressLink chainId={chainId} address={addr} />
                </div>
              ))}
            </div>
            <button className="btn btn-secondary" onClick={refetchPoolStatus} style={{ marginTop: 8 }}>Refresh</button>
          </>
        )}
      </CollapsibleSection>

      {/* 3. Whitelist Management */}
      <CollapsibleSection id="whitelist" label="Whitelist Management">
        {!hasPoolId ? (
          <div className="hint">Enter valid pool parameters above first</div>
        ) : (
          <>
            <div className="form-group">
              <label>Add Addresses (one per line or comma-separated)</label>
              <textarea
                value={newOwners}
                onChange={e => setNewOwners(e.target.value)}
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px', background: '#0f1a30', border: '1px solid #333',
                  borderRadius: '8px', color: '#e0e0e0', fontSize: '13px', fontFamily: 'monospace',
                  resize: 'vertical', outline: 'none',
                }}
                placeholder="0x..."
              />
            </div>
            <button className="btn btn-primary" disabled={!isOwner || !newOwners.trim()} onClick={handleAddOwners}>
              {!isOwner ? 'Not Hook Owner' : 'Add Pool Owners'}
            </button>

            {ownersList.length > 0 && (
              <>
                <div className="ps-label" style={{ marginTop: 16, marginBottom: 4, color: '#888', fontSize: 11 }}>
                  Current Owners — check to remove
                </div>
                {ownersList.map((addr, i) => (
                  <div key={i} className="whitelist-item">
                    <input
                      type="checkbox"
                      checked={removeChecked.has(addr)}
                      onChange={e => {
                        const next = new Set(removeChecked)
                        e.target.checked ? next.add(addr) : next.delete(addr)
                        setRemoveChecked(next)
                      }}
                    />
                    <AddressLink chainId={chainId} address={addr} />
                  </div>
                ))}
                <button className="btn btn-danger" disabled={!isOwner || removeChecked.size === 0} onClick={handleRemoveOwners} style={{ marginTop: 8 }}>
                  {!isOwner ? 'Not Hook Owner' : `Remove ${removeChecked.size} Owner(s)`}
                </button>
              </>
            )}
          </>
        )}
      </CollapsibleSection>

      {/* 4. Set Pool Start Time */}
      <CollapsibleSection id="startTime" label="Set Pool Start Time">
        {!hasPoolId ? (
          <div className="hint">Enter valid pool parameters above first</div>
        ) : (
          <>
            <div className="form-group">
              <label>New Start Time (UTC)</label>
              <input type="datetime-local" value={newStartDatetime} onChange={e => handleStartDatetimeChange(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Unix Timestamp</label>
              <input value={newStartTimestamp} onChange={e => handleStartTimestampChange(e.target.value)} placeholder="e.g. 1712500000" />
            </div>
            <button className="btn btn-primary" disabled={!isOwner || !newStartTimestamp} onClick={handleSetStartTime}>
              {!isOwner ? 'Not Hook Owner' : 'Set Pool Start Time'}
            </button>
          </>
        )}
      </CollapsibleSection>

      {/* 5. Set Position Manager */}
      <CollapsibleSection id="posManager" label="Set Position Manager">
        <div className="form-group">
          <label>New Position Manager Address</label>
          <input value={newPosManager} onChange={e => setNewPosManager(e.target.value)} placeholder="0x..." />
        </div>
        <button className="btn btn-primary" disabled={!isOwner || !isAddress(newPosManager)} onClick={handleSetPositionManager}>
          {!isOwner ? 'Not Hook Owner' : 'Set Position Manager'}
        </button>
      </CollapsibleSection>

      {/* 6. Emergency Withdraw */}
      <CollapsibleSection id="emergency" label="Emergency Withdraw">
        <div className="radio-group">
          <label><input type="radio" name="withdrawType" checked={withdrawType === 'safe'} onChange={() => setWithdrawType('safe')} /> ETH/ERC20 (Safe)</label>
          <label><input type="radio" name="withdrawType" checked={withdrawType === 'unsafe'} onChange={() => setWithdrawType('unsafe')} /> ERC20 (Unsafe)</label>
          <label><input type="radio" name="withdrawType" checked={withdrawType === 'erc721'} onChange={() => setWithdrawType('erc721')} /> ERC721</label>
        </div>
        <div className="form-group">
          <label>Token Address {withdrawType === 'safe' && <span className="hint">(use 0x000...0 for native ETH/BNB)</span>}</label>
          <input value={withdrawToken} onChange={e => setWithdrawToken(e.target.value)} placeholder="0x..." />
        </div>
        {withdrawType === 'erc721' && (
          <div className="form-group">
            <label>Token ID</label>
            <input value={withdrawTokenId} onChange={e => setWithdrawTokenId(e.target.value)} placeholder="e.g. 12345" />
          </div>
        )}
        <button className="btn btn-danger" disabled={!isOwner || !isAddress(withdrawToken)} onClick={handleEmergencyWithdraw}>
          {!isOwner ? 'Not Hook Owner' : 'Emergency Withdraw'}
        </button>
      </CollapsibleSection>

      {/* 7. Ownership Transfer */}
      <CollapsibleSection id="ownership" label="Ownership Transfer">
        <div className="form-group">
          <label>New Owner Address</label>
          <input value={newOwnerAddr} onChange={e => setNewOwnerAddr(e.target.value)} placeholder="0x..." />
        </div>
        <button className="btn btn-primary" disabled={!isOwner || !isAddress(newOwnerAddr)} onClick={handleTransferOwnership}>
          {!isOwner ? 'Not Hook Owner' : 'Transfer Ownership'}
        </button>
        {isPendingOwner && (
          <>
            <hr className="divider" />
            <div className="hint" style={{ marginBottom: 8, color: '#ffb74d' }}>
              You are the pending owner. Click below to accept ownership.
            </div>
            <button className="btn btn-primary" onClick={handleAcceptOwnership}>
              Accept Ownership
            </button>
          </>
        )}
      </CollapsibleSection>

      {/* Transaction status */}
      <TxStatus />
      {txError && <div className="status-box error">{txError}</div>}
    </div>
  )
}
