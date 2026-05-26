import React, { useEffect, useState } from "react"
import { Box, Text } from "ink"

const PET_INNER_WIDTH = 28

const PET_FRAMES: ReadonlyArray<ReadonlyArray<string>> = [
  [
    "      ((((((((((((((        ",
    "    ((((((((((((((((((      ",
    "    ((((  ◉    ◉  ))))      ",
    "     ((((   --   ))))       ",
    "       (((((||||))))        ",
  ],
  [
    "      ((((((((((((((        ",
    "    ((((((((((((((((((      ",
    "    ((((  ◉    ◉  ))))      ",
    "     ((((   ~~   ))))       ",
    "       (((((||||))))        ",
  ],
  [
    "      ((((((((((((((        ",
    "    ((((((((((((((((((      ",
    "    ((((  -    -  ))))      ",
    "     ((((   --   ))))       ",
    "       (((((||||))))        ",
  ],
  [
    "      ((((((((((((((        ",
    "    ((((((((((((((((((      ",
    "    ((((  ◉    ◉  ))))      ",
    "     ((((   --   ))))       ",
    "       (((((||||))))        ",
  ],
]

const PET_PULSE_COLORS = ["magenta", "magentaBright", "redBright", "magentaBright"] as const

const DEFAULT_LINES: ReadonlyArray<string> = ["memory loaded", "tools connected"]

export type BrainPetProps = {
  thinking: boolean
  status?: string
  lines?: ReadonlyArray<string>
}

function padCenter(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width)
  const left = Math.floor((width - text.length) / 2)
  const right = width - text.length - left
  return " ".repeat(left) + text + " ".repeat(right)
}

function padRight(text: string, width: number): string {
  if (text.length >= width) return `${text.slice(0, width - 1)}…`
  return text + " ".repeat(width - text.length)
}

export function BrainPet({ thinking, status, lines }: BrainPetProps) {
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

  const statusText = (status ?? "").trim() || (thinking ? "agent thinking..." : "agent waiting...")
  const extraLines = lines ?? DEFAULT_LINES
  const infoLines = [statusText, ...extraLines].slice(0, 3)
  while (infoLines.length < 3) infoLines.push("")

  const border = "─".repeat(PET_INNER_WIDTH)
  const empty = " ".repeat(PET_INNER_WIDTH)
  const titleText = padCenter("BrainPet", PET_INNER_WIDTH)

  return (
    <Box flexDirection="column">
      <Text color="cyan">{`┌${border}┐`}</Text>
      <Box>
        <Text color="cyan">│</Text>
        <Text color="cyan" bold>{titleText}</Text>
        <Text color="cyan">│</Text>
      </Box>
      <Text color="cyan">{`├${border}┤`}</Text>
      <Box>
        <Text color="cyan">│</Text>
        <Text>{empty}</Text>
        <Text color="cyan">│</Text>
      </Box>
      {brainLines.map((line, index) => (
        <Box key={`brain-${index}`}>
          <Text color="cyan">│</Text>
          <Text color={bodyColor}>{line}</Text>
          <Text color="cyan">│</Text>
        </Box>
      ))}
      <Box>
        <Text color="cyan">│</Text>
        <Text>{empty}</Text>
        <Text color="cyan">│</Text>
      </Box>
      {infoLines.map((line, index) => {
        const display = padRight(`   ${line}`, PET_INNER_WIDTH)
        const color = index === 0 ? (thinking ? "yellow" : "green") : "gray"
        return (
          <Box key={`info-${index}`}>
            <Text color="cyan">│</Text>
            <Text color={color}>{display}</Text>
            <Text color="cyan">│</Text>
          </Box>
        )
      })}
      <Box>
        <Text color="cyan">│</Text>
        <Text>{empty}</Text>
        <Text color="cyan">│</Text>
      </Box>
      <Text color="cyan">{`└${border}┘`}</Text>
    </Box>
  )
}
