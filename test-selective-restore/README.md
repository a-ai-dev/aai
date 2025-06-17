# Test Files for Selective Checkpoint Restoration

This directory contains test files to verify the selective checkpoint restoration feature works correctly.

## Test Scenario:
1. Create initial files (Checkpoint A)
2. Cline modifies some files
3. User modifies some files  
4. Create checkpoint B
5. Test selective restoration from A to B

## Expected Behavior:
- Files modified only by Cline should be restored
- Files modified only by User should be preserved
- Files modified by both should be flagged as conflicts
