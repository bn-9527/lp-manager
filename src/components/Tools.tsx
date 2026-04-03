import { useState } from 'react'
import FeeToTickSpacing from './tools/FeeToTickSpacing'
import DatetimeUnix from './tools/DatetimeUnix'
import SqrtPriceX96 from './tools/SqrtPriceX96'

type ToolTab = 'fee' | 'datetime' | 'sqrt'

export default function Tools() {
  const [tab, setTab] = useState<ToolTab>('fee')

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="tool-tabs">
        <button className={tab === 'fee' ? 'active' : ''} onClick={() => setTab('fee')}>
          Fee → TickSpacing
        </button>
        <button className={tab === 'datetime' ? 'active' : ''} onClick={() => setTab('datetime')}>
          Datetime → Unix
        </button>
        <button className={tab === 'sqrt' ? 'active' : ''} onClick={() => setTab('sqrt')}>
          sqrtPriceX96
        </button>
      </div>

      {tab === 'fee' && <FeeToTickSpacing />}
      {tab === 'datetime' && <DatetimeUnix />}
      {tab === 'sqrt' && <SqrtPriceX96 />}
    </div>
  )
}
