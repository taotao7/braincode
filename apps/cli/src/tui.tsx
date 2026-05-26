import React, { useEffect, useState } from "react"
import { Box, render, Text, useApp, useInput } from "ink"
import { executePromptFromConfig, planRuntimeFromConfig, type RuntimePlan } from "@braincode/agent-runtime"

type TranscriptItem = {
  id: string
  kind: "user" | "status" | "assistant" | "error" | "help"
  text: string
  plan?: RuntimePlan
}

type BraincodeTuiProps = {
  initialPrompt?: string
}

export async function runTui(initialPrompt?: string): Promise<void> {
  const instance = render(<BraincodeTui initialPrompt={initialPrompt} />)
  await instance.waitUntilExit()
}

function BraincodeTui({ initialPrompt }: BraincodeTuiProps) {
  const { exit } = useApp()
  const [draft, setDraft] = useState(initialPrompt ?? "")
  const [running, setRunning] = useState(false)
  const [items, setItems] = useState<TranscriptItem[]>([])

  useEffect(() => {
    if (initialPrompt?.trim()) {
      void submitPrompt(initialPrompt)
    }
  }, [])

  function appendItem(item: Omit<TranscriptItem, "id">) {
    setItems((previous) => [...previous, { id: crypto.randomUUID(), ...item }])
  }

  function handleCommand(commandLine: string): boolean {
    const [command = "", ...rest] = commandLine.slice(1).trim().split(/\s+/)
    const argument = rest.join(" ").trim()

    switch (command) {
      case "help":
      case "?":
        appendItem({
          kind: "help",
          text: [
            "Commands:",
            "/help or /? — show this help",
            "/plan <prompt> — preview Brain Model routing without a provider call",
            "/clear — clear the transcript",
            "/exit or /quit — leave the TUI",
            "",
            "Model/provider setup lives in `braincode config`; this TUI does not switch models directly.",
          ].join("\n"),
        })
        return true
      case "clear":
        setItems([])
        return true
      case "exit":
      case "quit":
        exit()
        return true
      case "plan":
        void previewPlan(argument)
        return true
      default:
        appendItem({ kind: "error", text: `Unknown command: /${command}. Type /help for commands.` })
        return true
    }
  }

  async function previewPlan(prompt: string) {
    const trimmed = prompt.trim()
    if (!trimmed) {
      appendItem({ kind: "error", text: "Usage: /plan <prompt>" })
      return
    }
    if (running) return

    const statusId = crypto.randomUUID()
    setItems((previous) => [
      ...previous,
      { id: crypto.randomUUID(), kind: "user", text: `/plan ${trimmed}` },
      { id: statusId, kind: "status", text: "Planning Braincode route..." },
    ])
    setDraft("")
    setRunning(true)

    try {
      const plan = await planRuntimeFromConfig(trimmed)
      setItems((previous) => [
        ...previous.filter((item) => item.id !== statusId),
        {
          id: crypto.randomUUID(),
          kind: "status",
          text: `${plan.brain.id} → ${plan.role} → ${plan.piModel.provider}/${plan.piModel.id}`,
          plan,
        },
      ])
    } catch (error) {
      setItems((previous) => [
        ...previous.filter((item) => item.id !== statusId),
        { id: crypto.randomUUID(), kind: "error", text: error instanceof Error ? error.message : String(error) },
      ])
    } finally {
      setRunning(false)
    }
  }

  async function submitPrompt(prompt: string) {
    const trimmed = prompt.trim()
    if (!trimmed || running) return

    if (trimmed.startsWith("/")) {
      setDraft("")
      handleCommand(trimmed)
      return
    }

    const userItem: TranscriptItem = { id: crypto.randomUUID(), kind: "user", text: trimmed }
    const statusId = crypto.randomUUID()
    setItems((previous) => [...previous, userItem, { id: statusId, kind: "status", text: "Routing through Braincode..." }])
    setDraft("")
    setRunning(true)

    try {
      const result = await executePromptFromConfig({ prompt: trimmed })
      setItems((previous) => [
        ...previous.filter((item) => item.id !== statusId),
        {
          id: crypto.randomUUID(),
          kind: "status",
          text: `${result.plan.brain.id} → ${result.plan.role} → ${result.plan.piModel.provider}/${result.plan.piModel.id}`,
          plan: result.plan,
        },
        { id: crypto.randomUUID(), kind: "assistant", text: result.summary || "(empty response)" },
      ])
    } catch (error) {
      setItems((previous) => [
        ...previous.filter((item) => item.id !== statusId),
        { id: crypto.randomUUID(), kind: "error", text: error instanceof Error ? error.message : String(error) },
      ])
    } finally {
      setRunning(false)
    }
  }

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit()
      return
    }

    if (key.return) {
      void submitPrompt(draft)
      return
    }

    if (key.backspace || key.delete) {
      setDraft((current) => current.slice(0, -1))
      return
    }

    if (!key.ctrl && !key.meta && input) {
      setDraft((current) => current + input)
    }
  })

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Box flexDirection="column">
          <Text color="cyan" bold>BRAIN / CODE</Text>
          <Text color="gray">Braincode Ink TUI · models are selected by brain routing, not inside the TUI.</Text>
        </Box>
      </Box>

      <Box flexDirection="column">
        {items.map((item) => (
          <Box key={item.id} flexDirection="column" marginBottom={1}>
            <Text color={colorFor(item.kind)}>{labelFor(item.kind)} {item.text}</Text>
            {item.plan ? <Text color="gray">mode={item.plan.mode} routing={item.plan.routing.source} toolExecution={item.plan.toolExecution}</Text> : null}
          </Box>
        ))}
      </Box>

      <Box borderStyle="single" borderColor={running ? "gray" : "green"} paddingX={1}>
        <Text color={running ? "gray" : "green"}>{running ? "Running" : "Prompt"} › </Text>
        <Text>{running ? "wait for the current run to finish" : draft}</Text>
      </Box>
      <Text color="gray">Enter submits · /help lists commands · Ctrl+C exits · configure models with `braincode config`</Text>
    </Box>
  )
}

function labelFor(kind: TranscriptItem["kind"]): string {
  switch (kind) {
    case "user": return "You:"
    case "assistant": return "Braincode:"
    case "error": return "Error:"
    case "status": return "Status:"
    case "help": return "Help:"
  }
}

function colorFor(kind: TranscriptItem["kind"]): "blue" | "cyan" | "green" | "red" | "yellow" {
  switch (kind) {
    case "user": return "blue"
    case "assistant": return "green"
    case "error": return "red"
    case "status": return "cyan"
    case "help": return "yellow"
  }
}
