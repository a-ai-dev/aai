export interface ClineIntent {
	readonly id: string
	readonly timestamp: number
	readonly description: string
	readonly scope: IntentScope
	readonly estimatedImpact: ImpactEstimate
	readonly dependencies: readonly string[]
	readonly status: IntentStatus
	readonly error?: string
}

export interface IntentScope {
	readonly files: readonly string[]
	readonly operations: readonly string[]
	readonly lineRanges?: readonly LineRange[]
}

export interface LineRange {
	readonly file: string
	readonly startLine: number
	readonly endLine: number
}

export interface ImpactEstimate {
	readonly filesModified: number
	readonly linesAdded: number
	readonly linesRemoved: number
	readonly linesModified: number
	readonly complexity: "low" | "medium" | "high"
}

export type IntentStatus = "declared" | "approved" | "executing" | "completed" | "reverted" | "failed"

export type OperationType = "create" | "modify" | "delete" | "move" | "copy"

export interface IntentHistory {
	readonly intents: readonly ClineIntent[]
	readonly executionOrder: readonly string[]
	readonly revertedIntents: readonly string[]
}

export function createIntent(description: string, scope: IntentScope, dependencies: string[] = []): ClineIntent {
	const estimatedImpact = calculateImpactEstimate(scope)

	return {
		id: generateIntentId(),
		timestamp: Date.now(),
		description,
		scope,
		estimatedImpact,
		dependencies,
		status: "declared",
	}
}

export function updateIntentStatus(intent: ClineIntent, status: IntentStatus, error?: string): ClineIntent {
	return {
		...intent,
		status,
		error,
	}
}

export function addIntentToHistory(history: IntentHistory, intent: ClineIntent): IntentHistory {
	return {
		...history,
		intents: [...history.intents, intent],
	}
}

export function revertIntent(history: IntentHistory, intentId: string): IntentHistory {
	return {
		...history,
		revertedIntents: [...history.revertedIntents, intentId],
	}
}

export function getIntentById(history: IntentHistory, intentId: string): ClineIntent | undefined {
	return history.intents.find((intent) => intent.id === intentId)
}

export function canRevertIntent(history: IntentHistory, intentId: string): boolean {
	const intent = getIntentById(history, intentId)
	if (!intent || intent.status !== "completed") return false
	if (history.revertedIntents.includes(intentId)) return false

	return !hasActiveDependents(history, intentId)
}

export function getIntentChain(history: IntentHistory, intentId: string): string[] {
	const chain: string[] = []
	const visited = new Set<string>()

	function collectDependents(id: string) {
		if (visited.has(id)) return
		visited.add(id)
		chain.push(id)

		const dependents = history.intents.filter(
			(intent) =>
				intent.dependencies.includes(id) && intent.status === "completed" && !history.revertedIntents.includes(intent.id),
		)

		for (const dependent of dependents) {
			collectDependents(dependent.id)
		}
	}

	collectDependents(intentId)
	return chain
}

export function getReversibleIntents(history: IntentHistory): readonly ClineIntent[] {
	return history.intents.filter((intent) => canRevertIntent(history, intent.id))
}

function generateIntentId(): string {
	return `intent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function calculateImpactEstimate(scope: IntentScope): ImpactEstimate {
	const filesModified = scope.files.length
	let linesEstimate = 0

	for (const operation of scope.operations) {
		switch (operation) {
			case "create":
				linesEstimate += 50
				break
			case "modify":
				linesEstimate += 20
				break
			case "delete":
				linesEstimate += 10
				break
			default:
				linesEstimate += 15
		}
	}

	const complexity =
		filesModified > 5 || linesEstimate > 100 ? "high" : filesModified > 2 || linesEstimate > 50 ? "medium" : "low"

	return {
		filesModified,
		linesAdded: Math.floor(linesEstimate * 0.6),
		linesRemoved: Math.floor(linesEstimate * 0.2),
		linesModified: Math.floor(linesEstimate * 0.2),
		complexity,
	}
}

function hasActiveDependents(history: IntentHistory, intentId: string): boolean {
	return history.intents.some(
		(intent) =>
			intent.dependencies.includes(intentId) &&
			intent.status === "completed" &&
			!history.revertedIntents.includes(intent.id),
	)
}
