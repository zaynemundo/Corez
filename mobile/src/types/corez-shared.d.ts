/**
 * Type surface for the shared JavaScript package. The package itself is plain
 * ESM shared with the web build; only the functions the native client calls
 * need declarations.
 */
declare module "@corez_ai/shared/intent" {
  export interface PublicIntent {
    label: "app" | "code-help" | "writing" | "explanation" | "general";
    confidence: number;
    oovRatio: number;
    accepted: boolean;
  }

  export interface EngineIntent {
    type: string;
    primaryIntent?: string;
    confidence?: number;
    [key: string]: unknown;
  }

  export function classifyPublicIntent(prompt: string): PublicIntent;
  export function classifyIntent(prompt: string): EngineIntent;
  export function toLegacyIntentType(intentType: unknown): string;
  export function extractRequirements(
    prompt: string,
    intent: unknown,
  ): { explicit: string[]; inferred: string[]; forbidden: string[] };
  export function createIntentContract(
    intent: unknown,
    requirements?: unknown,
  ): Record<string, unknown>;
  export function classifyComplexity(
    prompt: string,
    intent?: unknown,
  ): unknown;
  export function resolveSkills(args: {
    intent?: unknown;
    prompt?: string;
    registry?: unknown;
    availableTools?: string[];
  }): { skills?: { id: string }[]; compactExecutionPlan?: string | null };
  export function classifyExecutionMode(
    prompt: string,
    context?: Record<string, unknown>,
  ): string;
}
