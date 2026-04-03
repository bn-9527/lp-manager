import { useState, useMemo } from 'react'
import { calculateSqrtPriceX96 as calculate } from '../../utils/sqrtPrice'

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

  const result = useMemo(
    () =>
      calculate(
        addrA,
        addrB,
        parseInt(decA) || 0,
        parseInt(decB) || 0,
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
      {result && !result.error && (
        <div className="tool-result">
          <div className="kv">
            <div className="kv-label">Token Sort</div>
            <div className="kv-value">
              {result.isSwapped && (
                <span style={{ color: '#ff79c6', marginRight: 8 }}>Swapped</span>
              )}
              token0={result.sym0} token1={result.sym1}
            </div>
          </div>
          <div className="kv">
            <div className="kv-label">Pool Price (token1/token0)</div>
            <div className="kv-value">{result.poolPriceFloat.toPrecision(10)}</div>
          </div>
          <div className="kv">
            <div className="kv-label">sqrtPriceX96</div>
            <div className="kv-value">{result.sqrtPriceX96.toString()}</div>
          </div>
          <div className="kv">
            <div className="kv-label">sqrtPriceX96 (hex)</div>
            <div className="kv-value">{result.sqrtPriceX96Hex}</div>
          </div>
          <div className="kv">
            <div className="kv-label">Tick (approx)</div>
            <div className="kv-value">{result.tick}</div>
          </div>
          <div className="kv">
            <div className="kv-label" />
            <div style={{ color: '#888', fontSize: 12 }}>
              1 {result.symA} = {result.priceStr} {result.symB}
            </div>
          </div>
        </div>
      )}

      {result?.error && (
        <div className="tool-result">
          <div className="kv">
            <div className="kv-label">Error</div>
            <div className="kv-value" style={{ color: '#ff5555' }}>
              {result.error}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
