import React, { useEffect, useState } from "react"
import { Box, Text } from "ink"

const PET_FRAMES: ReadonlyArray<ReadonlyArray<string>> = [
  [
    "  ((  ◉ ◉  ))  ",
    "   (( --- ))   ",
  ],
  [
    "  ((  ◉ ◉  ))  ",
    "   (( ~~~ ))   ",
  ],
  [
    "  ((  - -  ))  ",
    "   (( --- ))   ",
  ],
  [
    "  ((  ◉ ◉  ))  ",
    "   (( --- ))   ",
  ],
]

const PET_PULSE_COLORS = ["magenta", "magentaBright", "redBright", "magentaBright"] as const

export type BrainPetProps = {
  thinking: boolean
  status?: string
  lines?: ReadonlyArray<string>
}

const STATUS_MAX = 16

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

export function BrainPet({ thinking, status }: BrainPetProps) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const tick = thinking ? 280 : 900
    const interval = setInterval(() => {
      setFrame((value) => (value + 1) % 1024)
    }, tick)
    return () => clearInterval(interval)
  }, [thinking])

  const idx = frame % PET_FRAMES.length
  const brainLines = thinking ? PET_FRAMES[idx] : PET_FRAMES[0]
  const bodyColor = thinking ? PET_PULSE_COLORS[idx] : "gray"

  const rawStatus = (status ?? "").trim() || (thinking ? "thinking" : "idle")
  const statusText = truncate(rawStatus, STATUS_MAX)
  const statusColor = thinking ? "yellow" : "gray"

  return (
    <Box flexDirection="column" alignItems="flex-end">
      {brainLines.map((line, index) => (
        <Text key={`brain-${index}`} color={bodyColor}>{line}</Text>
      ))}
      <Text color={statusColor}>{statusText}</Text>
    </Box>
  )
}
