import { isAddress } from 'viem'
import { explorerAddress } from '../config/contracts'

export default function AddressLink({
  chainId,
  address,
  label,
}: {
  chainId: number | undefined
  address: string
  label?: string
}) {
  // FIX: 无效地址会生成错误的 explorer URL，防御性校验后仅显示文本不带链接
  if (!address || !isAddress(address)) {
    return <span className="address-link"><code>{address || '???'}</code></span>
  }
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`
  return (
    <span className="address-link">
      <code>{label ?? short}</code>
      <a
        href={explorerAddress(chainId, address)}
        target="_blank"
        rel="noreferrer"
        className="explorer-btn"
        title="View on explorer"
      >
        &#x2197;
      </a>
    </span>
  )
}
