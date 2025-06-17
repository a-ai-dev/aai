import * as vscode from "vscode"
import * as path from "path"
import { listFiles } from "@services/glob/list-files"
import { sendWorkspaceUpdateEvent } from "@core/controller/file/subscribeToWorkspaceUpdates"

const cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0)

// Note: this is not a drop-in replacement for listFiles at the start of tasks, since that will be done for Desktops when there is no workspace selected
class WorkspaceTracker {
	private disposables: vscode.Disposable[] = []
	private filePaths: Set<string> = new Set()
	private periodicScanTimer?: NodeJS.Timeout
	private lastScanTime: number = 0
	private readonly SCAN_INTERVAL = 30000 // 30 seconds
	private readonly DEBOUNCE_DELAY = 2000 // 2 seconds debounce

	private get activeFiles() {
		return new Set(
			vscode.window.tabGroups.activeTabGroup.tabs
				.filter((tab) => tab.input instanceof vscode.TabInputText)
				.map((tab) => (tab.input as vscode.TabInputText).uri.fsPath),
		)
	}

	constructor() {
		this.registerListeners()
		this.startPeriodicScan()
	}

	async populateFilePaths() {
		// should not auto get filepaths for desktop since it would immediately show permission popup before cline ever creates a file
		if (!cwd) {
			return
		}
		const [files, _] = await listFiles(cwd, true, 1_000)
		files.forEach((file) => this.filePaths.add(this.normalizeFilePath(file)))
		this.workspaceDidUpdate()
	}

	/**
	 * Forces a refresh of the workspace file paths
	 * This is useful after commands that might have created/modified files externally
	 * (like git clone, npm install, etc.)
	 */
	async forceRefresh() {
		if (!cwd) {
			return
		}

		// Clear existing paths and repopulate
		this.filePaths.clear()
		const [files, _] = await listFiles(cwd, true, 1_000)
		files.forEach((file) => this.filePaths.add(this.normalizeFilePath(file)))
		this.workspaceDidUpdate()
	}

	private registerListeners() {
		// Listen for file creation
		// .bind(this) ensures the callback refers to class instance when using this, not necessary when using arrow function
		this.disposables.push(vscode.workspace.onDidCreateFiles(this.onFilesCreated.bind(this)))

		// Listen for file deletion
		this.disposables.push(vscode.workspace.onDidDeleteFiles(this.onFilesDeleted.bind(this)))

		// Listen for file renaming
		this.disposables.push(vscode.workspace.onDidRenameFiles(this.onFilesRenamed.bind(this)))

		// Listen for tab groups changes
		this.disposables.push(vscode.window.tabGroups.onDidChangeTabs(this.workspaceDidUpdate.bind(this)))

		// Listen for window focus changes to trigger external scans
		// This catches files added when user was outside VSCode
		this.disposables.push(
			vscode.window.onDidChangeWindowState((state) => {
				if (state.focused) {
					// User returned to VSCode, trigger external scan
					this.triggerExternalScan()
				}
			}),
		)

		/*
		 An event that is emitted when a workspace folder is added or removed.
		 **Note:** this event will not fire if the first workspace folder is added, removed or changed,
		 because in that case the currently executing extensions (including the one that listens to this
		 event) will be terminated and restarted so that the (deprecated) `rootPath` property is updated
		 to point to the first workspace folder.
		 */
		// In other words, we don't have to worry about the root workspace folder ([0]) changing since the extension will be restarted and our cwd will be updated to reflect the new workspace folder. (We don't care about non root workspace folders, since cline will only be working within the root folder cwd)
		// this.disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(this.onWorkspaceFoldersChanged.bind(this)))
	}

	private async onFilesCreated(event: vscode.FileCreateEvent) {
		await Promise.all(
			event.files.map(async (file) => {
				await this.addFilePath(file.fsPath)
			}),
		)
		this.workspaceDidUpdate()
	}

	private async onFilesDeleted(event: vscode.FileDeleteEvent) {
		let updated = false
		await Promise.all(
			event.files.map(async (file) => {
				if (await this.removeFilePath(file.fsPath)) {
					updated = true
				}
			}),
		)
		if (updated) {
			this.workspaceDidUpdate()
		}
	}

	private async onFilesRenamed(event: vscode.FileRenameEvent) {
		await Promise.all(
			event.files.map(async (file) => {
				await this.removeFilePath(file.oldUri.fsPath)
				await this.addFilePath(file.newUri.fsPath)
			}),
		)
		this.workspaceDidUpdate()
	}

	private async workspaceDidUpdate() {
		if (!cwd) {
			return
		}
		const filePaths = Array.from(new Set([...this.activeFiles, ...this.filePaths])).map((file) => {
			const relativePath = path.relative(cwd, file).toPosix()
			return file.endsWith("/") ? relativePath + "/" : relativePath
		})
		await sendWorkspaceUpdateEvent(filePaths)
	}

	private normalizeFilePath(filePath: string): string {
		const resolvedPath = cwd ? path.resolve(cwd, filePath) : path.resolve(filePath)
		return filePath.endsWith("/") ? resolvedPath + "/" : resolvedPath
	}

	private async addFilePath(filePath: string): Promise<string> {
		const normalizedPath = this.normalizeFilePath(filePath)
		try {
			const stat = await vscode.workspace.fs.stat(vscode.Uri.file(normalizedPath))
			const isDirectory = (stat.type & vscode.FileType.Directory) !== 0
			const pathWithSlash = isDirectory && !normalizedPath.endsWith("/") ? normalizedPath + "/" : normalizedPath
			this.filePaths.add(pathWithSlash)
			return pathWithSlash
		} catch {
			// If stat fails, assume it's a file (this can happen for newly created files)
			this.filePaths.add(normalizedPath)
			return normalizedPath
		}
	}

	private async removeFilePath(filePath: string): Promise<boolean> {
		const normalizedPath = this.normalizeFilePath(filePath)
		return this.filePaths.delete(normalizedPath) || this.filePaths.delete(normalizedPath + "/")
	}

	/**
	 * Starts periodic scanning to detect external file changes
	 * This catches files added/removed outside of VSCode (file explorer, network drives, etc.)
	 */
	private startPeriodicScan() {
		if (!cwd) {
			return
		}

		// Initial scan after a short delay
		setTimeout(() => {
			this.performPeriodicScan()
		}, 5000) // 5 second initial delay

		// Set up periodic scanning
		this.periodicScanTimer = setInterval(() => {
			this.performPeriodicScan()
		}, this.SCAN_INTERVAL)
	}

	/**
	 * Performs a periodic scan to detect external changes
	 * Uses debouncing to avoid excessive scanning
	 */
	private async performPeriodicScan() {
		const now = Date.now()

		// Debounce: don't scan if we just scanned recently
		if (now - this.lastScanTime < this.DEBOUNCE_DELAY) {
			return
		}

		this.lastScanTime = now

		try {
			// Get current file system state
			const [currentFiles, _] = await listFiles(cwd!, true, 1_000)
			const currentFilePaths = new Set(currentFiles.map((file) => this.normalizeFilePath(file)))

			// Compare with our tracked files
			const trackedPaths = new Set(this.filePaths)

			// Find new files (in filesystem but not tracked)
			const newFiles = [...currentFilePaths].filter((file) => !trackedPaths.has(file))

			// Find deleted files (tracked but not in filesystem)
			const deletedFiles = [...trackedPaths].filter((file) => !currentFilePaths.has(file))

			// Update our tracking if changes detected
			if (newFiles.length > 0 || deletedFiles.length > 0) {
				console.log(`External file changes detected: +${newFiles.length} files, -${deletedFiles.length} files`)

				// Update our file paths set
				this.filePaths = currentFilePaths

				// Notify about workspace changes
				await this.workspaceDidUpdate()
			}
		} catch (error) {
			// Silently handle errors to avoid spamming console
			// This can happen with permission issues, network drives, etc.
			console.debug("Periodic workspace scan error:", error)
		}
	}

	/**
	 * Triggers an immediate external scan (useful after user actions)
	 */
	async triggerExternalScan() {
		// Reset debounce timer to allow immediate scan
		this.lastScanTime = 0
		await this.performPeriodicScan()
	}

	public dispose() {
		// Clear periodic scan timer
		if (this.periodicScanTimer) {
			clearInterval(this.periodicScanTimer)
			this.periodicScanTimer = undefined
		}

		this.disposables.forEach((d) => d.dispose())
	}
}

export default WorkspaceTracker
