# External File Detection Test

This directory tests the enhanced workspace tracking system that detects files added outside of VSCode.

## Test Scenarios

1. **Periodic Scanning**: Every 30 seconds, the system scans for external changes
2. **Window Focus Detection**: When you return to VSCode, it immediately scans for changes
3. **Command-Based Detection**: After file-creation commands like `git clone`
4. **Manual Trigger**: The system can be manually triggered when needed

## How to Test

1. Create files in this directory using your file explorer (outside VSCode)
2. Switch back to VSCode - the files should appear in "VSCode Visible Files"
3. Delete files externally and return to VSCode - they should disappear from the list
4. Try copying folders from network drives or other locations

## Features

- **Debounced Scanning**: Prevents excessive file system access
- **Error Handling**: Gracefully handles permission issues and network drive problems
- **Performance Optimized**: Only scans when necessary
- **Real-time Updates**: Immediate detection when returning to VSCode
