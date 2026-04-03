import { useState, useRef, useCallback } from 'react'

interface TsResult {
  timestamp: number
  timestampMs: number
  iso: string
  utcStr: string
  localStr: string
  timezone: string
}

function formatDate(d: Date): TsResult {
  const ts = Math.floor(d.getTime() / 1000)
  const tsMs = d.getTime()
  const iso = d.toISOString()
  const utcStr =
    d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit', second: '2-digit' })
  const localStr =
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return { timestamp: ts, timestampMs: tsMs, iso, utcStr, localStr, timezone }
}

export default function DatetimeUnix() {
  const [utcDate, setUtcDate] = useState('')
  const [utcTime, setUtcTime] = useState('')
  const [unixInput, setUnixInput] = useState('')
  const [result, setResult] = useState<TsResult | null>(null)
  const updating = useRef(false)

  const onUtcChange = useCallback(
    (newDate: string, newTime: string) => {
      if (updating.current) return
      updating.current = true
      setUtcDate(newDate)
      setUtcTime(newTime)
      if (newDate && newTime) {
        const d = new Date(newDate + 'T' + newTime + 'Z')
        if (!isNaN(d.getTime())) {
          setUnixInput(String(Math.floor(d.getTime() / 1000)))
          setResult(formatDate(d))
        }
      } else {
        setResult(null)
      }
      updating.current = false
    },
    [],
  )

  const onUnixChange = useCallback((val: string) => {
    if (updating.current) return
    updating.current = true
    setUnixInput(val)
    const v = val.trim()
    if (v && !isNaN(Number(v))) {
      const d = new Date(parseInt(v) * 1000)
      if (!isNaN(d.getTime())) {
        setUtcDate(d.toISOString().slice(0, 10))
        setUtcTime(d.toISOString().slice(11, 19))
        setResult(formatDate(d))
      }
    } else {
      setResult(null)
    }
    updating.current = false
  }, [])

  const fillNow = useCallback(() => {
    const d = new Date()
    setUtcDate(d.toISOString().slice(0, 10))
    setUtcTime(d.toISOString().slice(11, 19))
    setUnixInput(String(Math.floor(d.getTime() / 1000)))
    setResult(formatDate(d))
  }, [])

  return (
    <div>
      <div style={{ fontSize: 14, color: '#888', marginBottom: 8 }}>UTC</div>
      <div className="form-group">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#888', fontWeight: 'bold', minWidth: 40 }}>Date</span>
          <input
            type="date"
            value={utcDate}
            onChange={(e) => onUtcChange(e.target.value, utcTime)}
          />
        </div>
      </div>
      <div className="form-group">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#888', fontWeight: 'bold', minWidth: 40 }}>Time</span>
          <input
            type="time"
            step="1"
            value={utcTime}
            onChange={(e) => onUtcChange(utcDate, e.target.value)}
          />
        </div>
      </div>

      <div style={{ fontSize: 14, color: '#888', marginBottom: 8, marginTop: 12 }}>
        Or enter Unix timestamp
      </div>
      <div className="form-group">
        <input
          type="text"
          inputMode="numeric"
          placeholder="e.g. 1772294340"
          value={unixInput}
          onChange={(e) => onUnixChange(e.target.value)}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <button
          style={{
            padding: '10px 20px',
            border: '1px solid #ff79c6',
            borderRadius: 8,
            background: '#2a1a3e',
            color: '#ff79c6',
            cursor: 'pointer',
            fontSize: 14,
          }}
          onClick={fillNow}
        >
          Now
        </button>
      </div>

      {result && (
        <div className="tool-result">
          <div className="kv">
            <div className="kv-label">Timestamp</div>
            <div className="kv-value">{result.timestamp}</div>
          </div>
          <div className="kv">
            <div className="kv-label">Timestamp (ms)</div>
            <div className="kv-value">{result.timestampMs}</div>
          </div>
          <div className="kv">
            <div className="kv-label">ISO 8601</div>
            <div className="kv-value">{result.iso}</div>
          </div>
          <div className="kv">
            <div className="kv-label">Date Time (UTC)</div>
            <div className="kv-value">{result.utcStr}</div>
          </div>
          <div className="kv">
            <div className="kv-label">{`Date Time (${result.timezone})`}</div>
            <div className="kv-value">{result.localStr}</div>
          </div>
        </div>
      )}
    </div>
  )
}
