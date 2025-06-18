#!/usr/bin/env node

const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")

function createIntentSystemChangeset() {
	console.log("🦋 Creating changeset for Intent-based Selective Restoration System\n")

	// Predefined changeset for our intent system feature
	const changeType = "minor"
	const description = "Add intent-based selective restoration system (resolves #4255)"
	const summary = `Implements comprehensive intent-based system for selective restoration of Cline-created changes while preserving user edits.

Key Features:
- Intent tracking with file scope and operation details
- File change attribution (Cline vs user modifications)  
- Selective restoration of only AI-generated changes
- Rich UI with intuitive status sorting and filtering
- Production-ready error handling and validation
- TypeScript improvements with proper type safety

Core Components:
- src/core/intent/ - Intent tracking system with IntentManager
- webview-ui/src/components/intent/ - React UI components
- webview-ui/src/components/chat/FileChangeTracker.tsx - Change attribution
- Enhanced TypeScript patterns with Result types and proper error boundaries

This directly addresses GitHub issue #4255 for selective restoration capabilities.`

	// Generate changeset content
	const changesetContent = `---
"claude-dev": ${changeType}
---

${description}

${summary}
`

	// Create changeset file
	const timestamp = Date.now()
	const randomId = Math.random().toString(36).substr(2, 9)
	const filename = `intent-system-${timestamp}-${randomId}.md`
	const changesetPath = path.join(".changeset", filename)

	// Ensure .changeset directory exists
	if (!fs.existsSync(".changeset")) {
		fs.mkdirSync(".changeset")
	}

	// Write changeset file
	fs.writeFileSync(changesetPath, changesetContent)

	console.log(`✅ Changeset created: ${changesetPath}`)
	console.log("\nChangeset content:")
	console.log("---")
	console.log(changesetContent)
	console.log("---")

	// Auto-commit the changeset
	try {
		execSync(`git add ${changesetPath}`, { stdio: "inherit" })
		execSync(`git commit -m "chore: Add changeset for intent-based selective restoration system"`, { stdio: "inherit" })
		console.log("\n✅ Changeset committed successfully!")

		// Also commit all our intent system files
		execSync("git add .", { stdio: "inherit" })
		execSync(
			'git commit -m "feat: Complete intent-based selective restoration system with TypeScript improvements\n\n- Add comprehensive intent tracking system\n- Implement file change attribution\n- Create rich UI components for intent management\n- Fix TypeScript type safety issues\n- Add proper error handling patterns\n- Resolves GitHub issue #4255"',
			{ stdio: "inherit" },
		)
		console.log("✅ Intent system files committed successfully!")
	} catch (error) {
		console.error("\n❌ Failed to commit:", error.message)
	}

	return changesetPath
}

// Run the function
createIntentSystemChangeset()
