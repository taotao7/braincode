import { Box, Text } from "ink"

const PET_LINES: ReadonlyArray<string> = [
  "(( ◉ ◉ ))",
  " ((---)) ",
]

export type BrainPetProps = {
  thinking: boolean
  status?: string
  lines?: ReadonlyArray<string>
  activeColor?: string
  activeStatusColor?: string
  idleColor?: string
}

const STATUS_MAX = 16

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

export function BrainPet({ thinking, status, activeColor = "magenta", activeStatusColor = "yellow", idleColor = "gray" }: BrainPetProps) {
  const bodyColor = thinking ? activeColor : idleColor

  const rawStatus = (status ?? "").trim() || (thinking ? "thinking" : "idle")
  const statusText = truncate(rawStatus, STATUS_MAX)
  const statusColor = thinking ? activeStatusColor : idleColor

  return (
    <Box flexDirection="row" alignItems="center">
      <Box marginRight={1}>
        <Text color={statusColor}>{statusText}</Text>
      </Box>
      <Box flexDirection="column" alignItems="flex-end">
        {PET_LINES.map((line, index) => (
          <Text key={`brain-${index}`} color={bodyColor}>{line}</Text>
        ))}
      </Box>
    </Box>
  )
}
