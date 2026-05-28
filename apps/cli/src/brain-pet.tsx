import { useEffect, useState } from "react"
import { Box, Text } from "ink"

const ACTIVE_FRAMES: ReadonlyArray<ReadonlyArray<string>> = [
  ["(( ◉ ◉ ))", " ((---)) "],
  ["(( ◉ ◉ ))", " ((___)) "],
  ["(( ◉ ◉ ))", " ((...)) "],
]

const IDLE_FRAMES: ReadonlyArray<ReadonlyArray<string>> = [
  ["(( - - ))", " ((---)) "],
  ["(( ◉ - ))", " ((---)) "],
]

const STATUS_MAX = 24
const LINE_MAX = 28
const DEFAULT_WIDTH = 34
const BODY_WIDTH = 9

export type BrainPetProps = {
  thinking: boolean
  status?: string
  lines?: ReadonlyArray<string>
  width?: number
  animate?: boolean
  activeColor?: string
  activeStatusColor?: string
  idleColor?: string
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

function normalizeLines(lines: ReadonlyArray<string> | undefined): string[] {
  const compact = (lines ?? []).map((line) => line.trim()).filter(Boolean)
  return [compact[0] ?? "", compact[1] ?? ""]
}

export function BrainPet({
  thinking,
  status,
  lines,
  width = DEFAULT_WIDTH,
  animate = false,
  activeColor = "magenta",
  activeStatusColor = "yellow",
  idleColor = "gray",
}: BrainPetProps) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (!animate) {
      setFrame(0)
      return
    }
    const handle = setInterval(() => {
      setFrame((value) => value + 1)
    }, thinking ? 900 : 1800)
    return () => clearInterval(handle)
  }, [animate, thinking])

  const frames = thinking ? ACTIVE_FRAMES : IDLE_FRAMES
  const body = frames[frame % frames.length] ?? frames[0]!
  const bodyColor = thinking ? activeColor : idleColor
  const rawStatus = (status ?? "").trim() || (thinking ? "watching run" : "idle")
  const textWidth = Math.max(1, width - BODY_WIDTH - 1)
  const statusText = truncate(rawStatus, Math.min(STATUS_MAX, textWidth))
  const statusColor = thinking ? activeStatusColor : idleColor
  const detailLines = normalizeLines(lines)

  return (
    <Box
      width={width}
      flexDirection="row"
      justifyContent="flex-end"
      alignItems="flex-end"
    >
      <Box
        width={textWidth}
        flexDirection="column"
        alignItems="flex-end"
        marginRight={1}
      >
        <Text color={statusColor} wrap="truncate-end">
          {statusText}
        </Text>
        {detailLines.map((line, index) => (
          <Text key={index} color={idleColor} wrap="truncate-end">
            {truncate(line, Math.min(LINE_MAX, textWidth)) || " "}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column" alignItems="flex-end">
        {body.map((line, index) => (
          <Text key={`brain-${index}`} color={bodyColor}>
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  )
}
