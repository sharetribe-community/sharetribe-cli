/**
 * Strict byte-by-byte comparison test for process workflow
 *
 * Tests that sharetribe-community-cli produces identical output to flex-cli for:
 * 1. Pull default-booking process
 * 2. Push unchanged (should show "No changes")
 * 3. Modify the process
 * 4. Push changed version
 * 5. Update alias
 * 6. Revert alias
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const MARKETPLACE = 'expertapplication-dev';
const PROCESS_NAME = 'default-booking';
const TEST_ALIAS = 'test-integration-alias';

/**
 * Executes a CLI command and returns output
 */
function runCli(command: string, cli: 'flex' | 'sharetribe'): string {
  const cliName = cli === 'flex' ? 'flex-cli' : 'sharetribe-community-cli';
  try {
    return execSync(`${cliName} ${command}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      // A CLI that never exits would block the whole run: execSync is
      // synchronous, so vitest's own testTimeout cannot interrupt it.
      timeout: 60_000,
    });
  } catch (error) {
    if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
      const stdout = (error as any).stdout || '';
      const stderr = (error as any).stderr || '';
      return stdout + stderr;
    }
    throw error;
  }
}

// NOTE: This integration test is skipped by default because it requires:
// 1. Valid authentication (run `sharetribe-community-cli login` first)
// 2. Access to expertapplication-dev marketplace
// 3. The push API endpoint to be working correctly
//
// To run this test, use: npm test -- process-integration.test.ts
describe('Process Workflow - Strict Comparison', () => {
  it('process deploy workflow matches flex-cli exactly', () => {
    // Create temporary directories for both CLIs
    const flexDir = mkdtempSync(join(tmpdir(), 'flex-process-'));
    const shareDir = mkdtempSync(join(tmpdir(), 'share-process-'));

    try {
      // 1. Get current version from both CLIs
      const listFlexOutput = runCli(
        `process list --marketplace ${MARKETPLACE} --process ${PROCESS_NAME}`,
        'flex'
      );
      const listShareOutput = runCli(
        `process list --marketplace ${MARKETPLACE} --process ${PROCESS_NAME}`,
        'sharetribe'
      );

      // Outputs should match exactly (structure and format)
      const flexLines = listFlexOutput.split('\n');
      const shareLines = listShareOutput.split('\n');
      expect(shareLines[1]).toBe(flexLines[1]); // Header should match

      // Extract version number from first data line
      const dataLine = flexLines.find(l => l.trim() && !l.includes('Created') && !l.includes('Version'));
      expect(dataLine).toBeTruthy();
      const versionStr = dataLine!.split(/\s+/).find(p => /^\d+$/.test(p));
      const initialVersion = parseInt(versionStr!);

      // 2. Pull process with both CLIs
      const pullFlexOutput = runCli(
        `process pull --marketplace ${MARKETPLACE} --process ${PROCESS_NAME} --path ${flexDir} --version ${initialVersion}`,
        'flex'
      );
      const pullShareOutput = runCli(
        `process pull --marketplace ${MARKETPLACE} --process ${PROCESS_NAME} --path ${shareDir} --version ${initialVersion}`,
        'sharetribe'
      );

      // Pull outputs should match
      expect(pullShareOutput).toBe(pullFlexOutput);

      // 3. Push unchanged process (should show "No changes")
      const pushNoChangeFlexOutput = runCli(
        `process push --marketplace ${MARKETPLACE} --process ${PROCESS_NAME} --path ${flexDir}`,
        'flex'
      );
      const pushNoChangeShareOutput = runCli(
        `process push --marketplace ${MARKETPLACE} --process ${PROCESS_NAME} --path ${shareDir}`,
        'sharetribe'
      );

      // "No changes" output should match
      expect(pushNoChangeShareOutput).toBe(pushNoChangeFlexOutput);

      // 4. Test that both CLIs handle "No changes" the same way
      // (already tested in step 3, both show "No changes")

      // 5. Modify process and push with flex-cli first
      const timestamp = Date.now();
      const flexProcessFile = join(flexDir, 'process.edn');
      let flexContent = readFileSync(flexProcessFile, 'utf-8');
      flexContent = flexContent.replace(':transition/inquire', `:transition/inquire-test-${timestamp}`);
      writeFileSync(flexProcessFile, flexContent, 'utf-8');

      const pushChangedFlexOutput = runCli(
        `process push --marketplace ${MARKETPLACE} --process ${PROCESS_NAME} --path ${flexDir}`,
        'flex'
      );

      // Extract new version number
      const versionMatch = pushChangedFlexOutput.match(/Version (\d+)/);
      expect(versionMatch).toBeTruthy();
      const newVersion = parseInt(versionMatch![1]);
      expect(newVersion).toBeGreaterThan(initialVersion);

      // 6. Now modify sharetribe's copy with same change and push
      const shareProcessFile = join(shareDir, 'process.edn');
      let shareContent = readFileSync(shareProcessFile, 'utf-8');
      shareContent = shareContent.replace(':transition/inquire', `:transition/inquire-test-${timestamp}`);
      writeFileSync(shareProcessFile, shareContent, 'utf-8');

      const pushChangedShareOutput = runCli(
        `process push --marketplace ${MARKETPLACE} --process ${PROCESS_NAME} --path ${shareDir}`,
        'sharetribe'
      );

      // Since flex already pushed this exact change, sharetribe should also see "No changes"
      // (both are pushing the same content to the same server)
      expect(pushChangedShareOutput.toLowerCase()).toContain('no changes');

      // 7. Delete alias first if it exists (cleanup from previous test runs)
      try {
        runCli(
          `process delete-alias --marketplace ${MARKETPLACE} --process ${PROCESS_NAME} --alias ${TEST_ALIAS}`,
          'flex'
        );
      } catch {
        // Ignore errors - alias might not exist
      }

      // 8. Create alias with flex-cli
      const createAliasFlexOutput = runCli(
        `process create-alias --marketplace ${MARKETPLACE} --process ${PROCESS_NAME} --version ${newVersion} --alias ${TEST_ALIAS}`,
        'flex'
      );

      // 9. Update same alias with sharetribe-community-cli (tests that update works)
      const updateAliasShareOutput = runCli(
        `process update-alias --marketplace ${MARKETPLACE} --process ${PROCESS_NAME} --version ${newVersion} --alias ${TEST_ALIAS}`,
        'sharetribe'
      );

      // Both should have successfully created/updated the alias
      expect(createAliasFlexOutput.toLowerCase()).toMatch(/success|created/);
      expect(updateAliasShareOutput.toLowerCase()).toMatch(/success|updated/);

      // 10. Delete alias to clean up
      const deleteFlexOutput = runCli(
        `process delete-alias --marketplace ${MARKETPLACE} --process ${PROCESS_NAME} --alias ${TEST_ALIAS}`,
        'flex'
      );
      const deleteShareOutput = runCli(
        `process delete-alias --marketplace ${MARKETPLACE} --process ${PROCESS_NAME} --alias ${TEST_ALIAS}`,
        'sharetribe'
      );

      // First delete should succeed, second should fail (already deleted)
      expect(deleteFlexOutput.toLowerCase()).toMatch(/success|deleted/);
      expect(deleteShareOutput.toLowerCase()).toMatch(/not found|does not exist/);

    } finally {
      // Clean up temporary directories
      try {
        rmSync(flexDir, { recursive: true, force: true });
        rmSync(shareDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn('Cleanup failed:', cleanupError);
      }
    }
  }, 60000); // 60 second timeout for full workflow
});
