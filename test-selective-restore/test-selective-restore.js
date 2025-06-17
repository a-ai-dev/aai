// Test script for selective checkpoint restoration
// This simulates the checkpoint restoration functionality

const fs = require("fs").promises
const path = require("path")

// Mock the CheckpointTracker functionality for testing
class MockCheckpointTracker {
	constructor() {
		this.files = new Map()
		this.checkpoints = new Map()
		this.currentCheckpoint = 0
	}

	// Simulate creating a checkpoint
	async createCheckpoint(name) {
		this.currentCheckpoint++
		const checkpointId = `checkpoint-${this.currentCheckpoint}`

		// Save current state of all files
		const fileStates = new Map()
		for (const [filePath, metadata] of this.files) {
			try {
				const content = await fs.readFile(filePath, "utf8")
				fileStates.set(filePath, {
					content,
					lastClineEdit: metadata.lastClineEdit,
					lastUserEdit: metadata.lastUserEdit,
					timestamp: Date.now(),
				})
			} catch (error) {
				console.log(`File ${filePath} not found, skipping`)
			}
		}

		this.checkpoints.set(checkpointId, {
			name,
			files: fileStates,
			timestamp: Date.now(),
		})

		console.log(`Created ${name} (${checkpointId})`)
		return checkpointId
	}

	// Simulate Cline modifying a file
	async clineModifyFile(filePath, newContent) {
		const now = Date.now()
		await fs.writeFile(filePath, newContent, "utf8")

		if (!this.files.has(filePath)) {
			this.files.set(filePath, { lastClineEdit: null, lastUserEdit: null })
		}

		const metadata = this.files.get(filePath)
		metadata.lastClineEdit = now

		console.log(`Cline modified: ${filePath}`)
	}

	// Simulate User modifying a file
	async userModifyFile(filePath, newContent) {
		const now = Date.now()
		await fs.writeFile(filePath, newContent, "utf8")

		if (!this.files.has(filePath)) {
			this.files.set(filePath, { lastClineEdit: null, lastUserEdit: null })
		}

		const metadata = this.files.get(filePath)
		metadata.lastUserEdit = now

		console.log(`User modified: ${filePath}`)
	}

	// Simulate selective restoration
	async selectiveRestore(fromCheckpointId, options = { restoreOnlyClineFiles: true, preserveUserEdits: true }) {
		const checkpoint = this.checkpoints.get(fromCheckpointId)
		if (!checkpoint) {
			throw new Error(`Checkpoint ${fromCheckpointId} not found`)
		}

		const results = {
			restoredFiles: [],
			preservedFiles: [],
			conflictFiles: [],
		}

		console.log(`\nPerforming selective restore to ${checkpoint.name}...`)

		for (const [filePath, checkpointState] of checkpoint.files) {
			const currentMetadata = this.files.get(filePath)

			if (!currentMetadata) {
				// File wasn't tracked, restore it
				await fs.writeFile(filePath, checkpointState.content, "utf8")
				results.restoredFiles.push(filePath)
				continue
			}

			const clineModifiedSince = currentMetadata.lastClineEdit && currentMetadata.lastClineEdit > checkpoint.timestamp
			const userModifiedSince = currentMetadata.lastUserEdit && currentMetadata.lastUserEdit > checkpoint.timestamp

			if (clineModifiedSince && userModifiedSince) {
				// Conflict: both modified
				if (options.preserveUserEdits && currentMetadata.lastUserEdit > currentMetadata.lastClineEdit) {
					results.preservedFiles.push(filePath)
				} else {
					results.conflictFiles.push(filePath)
				}
			} else if (clineModifiedSince && !userModifiedSince) {
				// Only Cline modified - restore
				await fs.writeFile(filePath, checkpointState.content, "utf8")
				results.restoredFiles.push(filePath)
			} else if (!clineModifiedSince && userModifiedSince) {
				// Only user modified - preserve
				results.preservedFiles.push(filePath)
			} else {
				// Neither modified significantly - restore
				await fs.writeFile(filePath, checkpointState.content, "utf8")
				results.restoredFiles.push(filePath)
			}
		}

		return results
	}

	// Helper to show current file contents
	async showFileContents(filePath) {
		try {
			const content = await fs.readFile(filePath, "utf8")
			console.log(`\n--- ${filePath} ---`)
			console.log(content)
			console.log("--- End ---\n")
		} catch (error) {
			console.log(`File ${filePath} not found`)
		}
	}
}

// Run the test
async function runTest() {
	console.log("=== Testing Selective Checkpoint Restoration ===\n")

	const tracker = new MockCheckpointTracker()

	// Register test files
	const testFiles = ["cline-only-file.js", "user-only-file.js", "conflict-file.js"]

	for (const file of testFiles) {
		tracker.files.set(file, { lastClineEdit: null, lastUserEdit: null })
	}

	// Step 1: Create initial checkpoint
	const checkpointA = await tracker.createCheckpoint("Initial State (A)")

	// Wait a bit to ensure timestamp differences
	await new Promise((resolve) => setTimeout(resolve, 100))

	// Step 2: Cline modifies cline-only-file
	await tracker.clineModifyFile(
		"cline-only-file.js",
		`
// This file was modified by Cline
// Updated version - after Checkpoint A

function enhancedFunction() {
    console.log("Cline enhanced this function");
    return "cline-enhanced";
}

function newClineFunction() {
    return "added by cline";
}

module.exports = { enhancedFunction, newClineFunction };
`,
	)

	// Step 3: User modifies user-only-file (simulated)
	await tracker.userModifyFile(
		"user-only-file.js",
		`
// This file was modified by User
// User's version - after Checkpoint A

function userFunction() {
    console.log("User enhanced this function");
    return "user-enhanced";
}

function newUserFunction() {
    return "added by user";
}

module.exports = { userFunction, newUserFunction };
`,
	)

	// Step 4: Both modify conflict-file
	await tracker.clineModifyFile(
		"conflict-file.js",
		`
// This file was modified by Cline first
// Cline's version - after Checkpoint A

function conflictFunction() {
    console.log("Cline modified this");
    return "cline-modified";
}

const sharedData = {
    version: "2.0.0",
    status: "cline-updated",
    clineFeature: true
};

module.exports = { conflictFunction, sharedData };
`,
	)

	await new Promise((resolve) => setTimeout(resolve, 100))

	await tracker.userModifyFile(
		"conflict-file.js",
		`
// This file was modified by User after Cline
// User's version - after Checkpoint A

function conflictFunction() {
    console.log("User modified this after Cline");
    return "user-modified";
}

const sharedData = {
    version: "2.1.0", 
    status: "user-updated",
    userFeature: true
};

module.exports = { conflictFunction, sharedData };
`,
	)

	// Step 5: Show current state
	console.log("\n=== Current State (Before Restoration) ===")
	for (const file of testFiles) {
		await tracker.showFileContents(file)
	}

	// Step 6: Perform selective restoration
	const results = await tracker.selectiveRestore(checkpointA)

	// Step 7: Show results
	console.log("\n=== Selective Restoration Results ===")
	console.log("Restored files (Cline-only changes):", results.restoredFiles)
	console.log("Preserved files (User-only changes):", results.preservedFiles)
	console.log("Conflict files (Both modified):", results.conflictFiles)

	// Step 8: Show final state
	console.log("\n=== Final State (After Restoration) ===")
	for (const file of testFiles) {
		await tracker.showFileContents(file)
	}

	// Step 9: Verify expected behavior
	console.log("\n=== Test Verification ===")

	const clineFileContent = await fs.readFile("cline-only-file.js", "utf8")
	const userFileContent = await fs.readFile("user-only-file.js", "utf8")
	const conflictFileContent = await fs.readFile("conflict-file.js", "utf8")

	const tests = [
		{
			name: "Cline-only file should be restored to checkpoint A",
			pass: clineFileContent.includes("Initial version"),
			actual: clineFileContent.includes("Cline enhanced") ? "Not restored" : "Restored",
		},
		{
			name: "User-only file should be preserved (not restored)",
			pass: userFileContent.includes("User enhanced"),
			actual: userFileContent.includes("User enhanced") ? "Preserved" : "Restored",
		},
		{
			name: "Conflict file should be preserved (user edit was more recent)",
			pass: conflictFileContent.includes("User modified"),
			actual: conflictFileContent.includes("User modified") ? "Preserved" : "Restored",
		},
	]

	let allPassed = true
	for (const test of tests) {
		const status = test.pass ? "PASS" : "FAIL"
		console.log(`${status}: ${test.name} (${test.actual})`)
		if (!test.pass) allPassed = false
	}

	console.log(`\n=== Overall Test Result: ${allPassed ? "PASS" : "FAIL"} ===`)

	return allPassed
}

// Run the test if this file is executed directly
if (require.main === module) {
	runTest().catch(console.error)
}

module.exports = { runTest }
