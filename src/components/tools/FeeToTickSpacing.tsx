import { useState } from 'react'
import { feeToTickSpacing } from '../../utils/encoder'

const FEE_PRESETS: Record<number, number> = { 100: 1, 200: 4, 300: 6, 400: 8, 500: 10, 3000: 60, 10000: 200 }
const PRESET_FEE_LIST = [100, 200, 250, 300, 400, 500, 3000, 10000]

function percentToFee(pct: string): number {
  return Math.round(parseFloat(pct) * 10000)
}

export default function FeeToTickSpacing() {
  const [feeInput, setFeeInput] = useState('')

  const pct = feeInput.trim()
  const fee = pct && !isNaN(Number(pct)) ? percentToFee(pct) : NaN
  const validFee = !isNaN(fee) && fee >= 1
  const tickSpacing = validFee ? feeToTickSpacing(fee) : null
  const isPreset = validFee && FEE_PRESETS[fee] !== undefined

  // Build reference table rows: all presets + current input, deduplicated & sorted
  const allFees = new Set([
    ...Object.keys(FEE_PRESETS).map(Number),
    ...PRESET_FEE_LIST,
  ])
  if (validFee) allFees.add(fee)
  const sortedFees = [...allFees].sort((a, b) => a - b)

  return (
    <div>
      <div className="form-group">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            inputMode="decimal"
            placeholder="e.g. 0.025"
            value={feeInput}
            onChange={(e) => setFeeInput(e.target.value)}
          />
          <span style={{ color: '#888', fontWeight: 'bold', fontSize: 16 }}>%</span>
        </div>
      </div>

      <div className="tool-result" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 15, minHeight: 48 }}>
        tickSpacing:{' '}
        <span style={{ color: '#50fa7b', fontWeight: 'bold', fontSize: 18 }}>
          {tickSpacing !== null ? tickSpacing : '-'}
        </span>
        {validFee && (
          <>
            <span className="fee-table tag">fee={fee}</span>
            <span className="fee-table tag">{isPreset ? 'preset' : 'formula'}</span>
          </>
        )}
      </div>

      <div className="tool-presets">
        {PRESET_FEE_LIST.map((f) => (
          <button
            key={f}
            className={validFee && fee === f ? 'active' : ''}
            onClick={() => setFeeInput(String(f / 10000))}
          >
            {f / 10000}%
          </button>
        ))}
      </div>

      <table className="fee-table">
        <thead>
          <tr>
            <th>Fee Rate</th>
            <th>Fee (bips)</th>
            <th>TickSpacing</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sortedFees.map((f) => {
            const ts = feeToTickSpacing(f)
            const preset = FEE_PRESETS[f] !== undefined
            return (
              <tr key={f} className={validFee && f === fee ? 'active' : ''}>
                <td>{f / 10000}%</td>
                <td>{f}</td>
                <td className="hl">{ts}</td>
                <td>
                  <span className="tag">{preset ? 'preset' : 'formula'}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
