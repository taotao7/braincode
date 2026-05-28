import { Box, Text } from "ink"

const PET_LINES: ReadonlyArray<string> = [
  "(( ◉ ◉ ))",
  " ((---)) ",
]

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
  const bodyColor = thinking ? "magenta" : "gray"

  const rawStatus = (status ?? "").trim() || (thinking ? "thinking" : "idle")
  const statusText = truncate(rawStatus, STATUS_MAX)
  const statusColor = thinking ? "yellow" : "gray"

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
