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
