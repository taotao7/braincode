import type { AgentTool, AgentToolResult } from "./pi-agent"
import { Type } from "typebox"
import type { ModelPolicy } from "@braincode/brain"
import { generateImage, type BraincodeModel } from "@braincode/llm"
import { debugLog } from "@braincode/shared"
import { saveGeneratedImageArtifact, selectImageMakerModelCandidates } from "./image-maker"

export const GENERATE_IMAGE_TOOL_NAME = "generate_image"

export type GenerateImageToolOptions = {
  models: BraincodeModel[]
  home: string | undefined
  sessionId: string
  // The imageMaker role's resolved model policy. Used to pick an
  // image-generation-capable model + provider API key the same way the
  // imageMaker worker does, so the primary agent can generate an asset mid-run
  // without a planned imageMaker worker.
  imagePolicy: ModelPolicy
  signal?: AbortSignal
}

type GenerateImageDetails = {
  tool: typeof GENERATE_IMAGE_TOOL_NAME
  artifactPath?: string
  modelId?: string
  provider?: string
  bytes?: number
}

function toolResult(text: string, details: GenerateImageDetails): AgentToolResult<GenerateImageDetails> {
  return { content: [{ type: "text", text }], details }
}

// A local tool that lets the primary agent (e.g. frontend) generate a raster
// image asset on demand. It mirrors the imageMaker worker's generation path
// (selectImageMakerModelCandidates -> generateImage -> saveGeneratedImageArtifact)
// but is callable mid-run, which the dispatch_specialist tool cannot do because
// imageMaker is intentionally excluded from dispatchable roles.
export function createGenerateImageTool(options: GenerateImageToolOptions): AgentTool {
  const parameters = Type.Object({
    prompt: Type.String({ description: "Describe the image to generate: subject, style, and any brand or layout constraints." }),
    size: Type.Optional(Type.String({ description: "Optional size hint like 1024x1024, 1536x1024, or 1024x1536." })),
  })
  return {
    name: GENERATE_IMAGE_TOOL_NAME,
    label: "Generate Image",
    description: "Generate a raster image asset (PNG/JPEG/WebP) for the current project and save it as a file. Returns the saved artifact path so you can reference it in code or markup. Use for hero images, illustrations, icons, avatars, or other visual assets the user asks for.",
    parameters,
    prepareArguments: (args) => {
      const record = args && typeof args === "object" && !Array.isArray(args) ? args as Record<string, unknown> : {}
      const prompt = typeof record.prompt === "string" ? record.prompt.trim() : ""
      if (!prompt) throw new Error("generate_image requires a non-empty 'prompt' describing the image.")
      const size = typeof record.size === "string" && record.size.trim() ? record.size.trim() : undefined
      return { prompt, size }
    },
    execute: async (_toolCallId, params, signal) => {
      const input = params as { prompt: string; size?: string }
      const effectiveSignal = signal ?? options.signal
      let candidates
      try {
        candidates = await selectImageMakerModelCandidates(options.imagePolicy, options.models, options.home)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return toolResult(
          `No image-generation-capable model is configured for this run (${message}). Ask the user to configure an imageMaker model, or describe the needed image as a placeholder instead.`,
          { tool: GENERATE_IMAGE_TOOL_NAME },
        )
      }
      if (candidates.length === 0) {
        return toolResult(
          "No image-generation-capable model is configured for this run. Ask the user to configure an imageMaker model, or describe the needed image as a placeholder instead.",
          { tool: GENERATE_IMAGE_TOOL_NAME },
        )
      }
      const errors: string[] = []
      for (const [attempt, { selection, apiKey }] of candidates.entries()) {
        try {
          if (effectiveSignal?.aborted) throw new Error("aborted")
          const generation = await generateImage(selection.configured, apiKey, { prompt: input.prompt, size: input.size, signal: effectiveSignal })
          const artifactPath = await saveGeneratedImageArtifact(options.sessionId, generation, options.home)
          const revised = generation.revisedPrompt ? `\nProvider revised prompt: ${generation.revisedPrompt}` : ""
          return toolResult(
            `Generated image artifact: ${artifactPath}\nModel: ${generation.provider}/${generation.modelId}\nBytes: ${generation.bytes}${revised}`,
            { tool: GENERATE_IMAGE_TOOL_NAME, artifactPath, modelId: generation.modelId, provider: generation.provider, bytes: generation.bytes },
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (effectiveSignal?.aborted) throw error
          errors.push(`${selection.configured.id}: ${message}`)
          debugLog("runtime", "generate_image attempt failed", { attempt: attempt + 1, modelId: selection.configured.id, error: message })
        }
      }
      return toolResult(
        `Image generation failed across ${candidates.length} candidate model(s):\n${errors.map((entry) => `- ${entry}`).join("\n")}`,
        { tool: GENERATE_IMAGE_TOOL_NAME },
      )
    },
    executionMode: "sequential",
  }
}
