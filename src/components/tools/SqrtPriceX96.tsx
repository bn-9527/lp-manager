import { useState, useMemo } from 'react'
import { calculateSqrtPriceX96 } from '../../utils/sqrtPrice'

const PRICE_PRESETS = ['1', '0.001', '100', '1000', '2000']

export default function SqrtPriceX96() {
  const [addrA, setAddrA] = useState('')
  const [decA, setDecA] = useState('18')
  const [symA, setSymA] = useState('')
  const [addrB, setAddrB] = useState('')
  const [decB, setDecB] = useState('18')
  const [symB, setSymB] = useState('')
  const [priceInput, setPriceInput] = useState('')

  const displaySymA = symA || 'A'
  const displaySymB = symB || 'B'

  const priceResult = useMemo(
    () =>
      calculateSqrtPriceX96(
        addrA,
        addrB,
        // FIX: 使用 isNaN 而非 || 做 fallback，避免 falsy-zero bug：
        // parseInt('0') 返回 0，0 || 18 会静默替换为 18，导致 decimals=0 的 token
        // （如 AMPL 等）计算出完全错误的 sqrtPriceX96。与 AddLiquidity 中已修复的
        // fee || 500 和 slippage || 0.1 是同一 anti-pattern。
        (() => { const v = parseInt(decA); return isNaN(v) ? 18 : v })(),
        (() => { const v = parseInt(decB); return isNaN(v) ? 18 : v })(),
        displaySymA,
        displaySymB,
        priceInput,
      ),
    [addrA, addrB, decA, decB, displaySymA, displaySymB, priceInput],
  )

  return (
    <div>
      {/* Token A */}
      <div style={{ fontSize: 14, color: '#888', marginBottom: 8 }}>
        Token A (sorted as token0 if address is lower)
      </div>
      <div className="form-group">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#888', fontWeight: 'bold', minWidth: 70 }}>Address</span>
          <input
            type="text"
            placeholder="0x... (lower address = token0)"
            value={addrA}
            onChange={(e) => setAddrA(e.target.value)}
          />
        </div>
      </div>
      <div className="form-group">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#888', fontWeight: 'bold', minWidth: 70 }}>Decimals</span>
          <input
            type="text"
            inputMode="numeric"
            value={decA}
            onChange={(e) => setDecA(e.target.value)}
            style={{ maxWidth: 80 }}
          />
          <span style={{ color: '#888', fontWeight: 'bold', minWidth: 50 }}>Symbol</span>
          <input
            type="text"
            placeholder="e.g. WBNB"
            value={symA}
            onChange={(e) => setSymA(e.target.value)}
            style={{ maxWidth: 100 }}
          />
        </div>
      </div>

      {/* Token B */}
      <div style={{ fontSize: 14, color: '#888', marginBottom: 8, marginTop: 12 }}>Token B</div>
      <div className="form-group">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#888', fontWeight: 'bold', minWidth: 70 }}>Address</span>
          <input
            type="text"
            placeholder="0x..."
            value={addrB}
            onChange={(e) => setAddrB(e.target.value)}
          />
        </div>
      </div>
      <div className="form-group">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#888', fontWeight: 'bold', minWidth: 70 }}>Decimals</span>
          <input
            type="text"
            inputMode="numeric"
            value={decB}
            onChange={(e) => setDecB(e.target.value)}
            style={{ maxWidth: 80 }}
          />
          <span style={{ color: '#888', fontWeight: 'bold', minWidth: 50 }}>Symbol</span>
          <input
            type="text"
            placeholder="e.g. USDT"
            value={symB}
            onChange={(e) => setSymB(e.target.value)}
            style={{ maxWidth: 100 }}
          />
        </div>
      </div>

      {/* Price input */}
      <div style={{ fontSize: 14, color: '#888', marginBottom: 8, marginTop: 12 }}>
        Price (how much Token B per 1 Token A)
      </div>
      <div className="form-group">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#888', fontWeight: 'bold' }}>1</span>
          <span style={{ color: '#ff79c6', minWidth: 40 }}>{displaySymA}</span>
          <span style={{ color: '#888', fontWeight: 'bold' }}>=</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="e.g. 600"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
          />
          <span style={{ color: '#ff79c6', minWidth: 40 }}>{displaySymB}</span>
        </div>
      </div>

      {/* Price presets */}
      <div className="tool-presets">
        <button onClick={() => setPriceInput('1')}>1:1</button>
        {PRICE_PRESETS.slice(1).map((p) => (
          <button key={p} onClick={() => setPriceInput(p)}>
            {p}
          </button>
        ))}
      </div>

      {/* Results */}
      {priceResult && !priceResult.error && (
        <div className="tool-result">
          <div className="kv">
            <div className="kv-label">Token Sort</div>
            <div className="kv-value">
              {priceResult.isSwapped && (
                <span style={{ color: '#ff79c6', marginRight: 8 }}>Swapped</span>
              )}
              token0={priceResult.sym0} token1={priceResult.sym1}
            </div>
          </div>
          <div className="kv">
            <div className="kv-label">Pool Price (token1/token0)</div>
            <div className="kv-value">{priceResult.poolPriceFloat.toPrecision(10)}</div>
          </div>
          <div className="kv">
            <div className="kv-label">sqrtPriceX96</div>
            <div className="kv-value">{priceResult.sqrtPriceX96.toString()}</div>
          </div>
          <div className="kv">
            <div className="kv-label">sqrtPriceX96 (hex)</div>
            <div className="kv-value">{priceResult.sqrtPriceX96Hex}</div>
          </div>
          <div className="kv">
            <div className="kv-label">Tick (approx)</div>
            <div className="kv-value">{priceResult.tick}</div>
          </div>
          <div className="kv">
            <div className="kv-label" />
            <div style={{ color: '#888', fontSize: 12 }}>
              1 {priceResult.symA} = {priceResult.priceStr} {priceResult.symB}
            </div>
          </div>
        </div>
      )}

      {priceResult?.error && (
        <div className="tool-result">
          <div className="kv">
            <div className="kv-label">Error</div>
            <div className="kv-value" style={{ color: '#ff5555' }}>
              {priceResult.error}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
