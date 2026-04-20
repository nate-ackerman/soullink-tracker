import { useState } from 'react'

const IMG_BASE = 'https://img.nuzlocke.app'

interface TrainerImageProps {
  imageUrl?: string
  name: string
  size?: number
  className?: string
}

export function TrainerImage({ imageUrl, name, size = 80, className = '' }: TrainerImageProps) {
  const [failed, setFailed] = useState(false)

  if (!imageUrl || failed) {
    return (
      <div
        className={`rounded bg-elevated flex items-center justify-center text-text-muted text-xs font-medium ${className}`}
        style={{ width: size, height: size, minWidth: size }}
      >
        {name.slice(0, 2).toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={`${IMG_BASE}${imageUrl}.webp`}
      alt={name}
      width={size}
      height={size}
      className={`object-contain ${className}`}
      style={{ width: size, height: size, minWidth: size }}
      onError={() => setFailed(true)}
    />
  )
}
