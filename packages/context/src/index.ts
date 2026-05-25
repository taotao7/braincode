import type { ContextRef } from "@braincode/protocol"

export type HandoffPacket = {
  id: string
  goal: string
  constraints: string[]
  contextRefs: ContextRef[]
  expectedResult: string
}

export type WorkerResult = {
  handoffId: string
  summary: string
  artifacts: ContextRef[]
  risks: string[]
  nextQuestions: string[]
}
