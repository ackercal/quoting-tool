import { useState, useEffect, useRef } from 'react'

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number
  onChange: (v: number) => void
}

export default function NumInput({ value, onChange, ...props }: Props) {
  const [raw, setRaw] = useState(String(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setRaw(String(value))
  }, [value])

  return (
    <input
      {...props}
      type="number"
      value={raw}
      onFocus={e => { focused.current = true; props.onFocus?.(e) }}
      onChange={e => {
        setRaw(e.target.value)
        const n = parseFloat(e.target.value)
        if (!isNaN(n)) onChange(n)
      }}
      onBlur={e => {
        focused.current = false
        const n = parseFloat(raw)
        const safe = isNaN(n) ? 0 : n
        setRaw(String(safe))
        onChange(safe)
        props.onBlur?.(e)
      }}
    />
  )
}
