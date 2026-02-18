import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import type { CheckpointState } from '../types/research.js';
import { createLogger } from '../logger.js';

const log = createLogger('checkpoint');

const CURRENT_VERSION = 1;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CheckpointService {
  private readonly dir: string;

  constructor(baseDir?: string) {
    this.dir = baseDir || path.join(os.tmpdir(), 'research-agent-checkpoints');
  }

  /** Create the checkpoint directory if it doesn't exist. Call at startup for fail-fast. */
  async initialize(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    log.info('Checkpoint directory ready', { dir: this.dir });
  }

  /** Returns true if a checkpoint exists for the given sessionId. */
  async exists(sessionId: string): Promise<boolean> {
    try {
      await fs.access(this.filePath(sessionId));
      return true;
    } catch {
      return false;
    }
  }

  /** Save checkpoint state to disk. */
  async save(sessionId: string, state: CheckpointState): Promise<void> {
    this.validateId(sessionId);
    state.updatedAt = new Date().toISOString();
    const data = JSON.stringify(state, null, 2);
    await fs.writeFile(this.filePath(sessionId), data, 'utf-8');
    log.debug('Checkpoint saved', { sessionId, step: state.lastCompletedStep });
  }

  /** Load checkpoint state from disk. Returns null on missing, corrupt, or version-mismatched files. */
  async load(sessionId: string): Promise<CheckpointState | null> {
    this.validateId(sessionId);
    try {
      const data = await fs.readFile(this.filePath(sessionId), 'utf-8');
      const state = JSON.parse(data) as CheckpointState;
      if (state.version !== CURRENT_VERSION) {
        log.warn('Checkpoint version mismatch, ignoring', {
          sessionId,
          found: state.version,
          expected: CURRENT_VERSION,
        });
        return null;
      }
      return state;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.debug('Failed to load checkpoint', { sessionId, error: message });
      return null;
    }
  }

  /** Delete a checkpoint file. No-op if the file doesn't exist. */
  async delete(sessionId: string): Promise<void> {
    this.validateId(sessionId);
    try {
      await fs.unlink(this.filePath(sessionId));
      log.debug('Checkpoint deleted', { sessionId });
    } catch {
      // File may already be gone — that's fine
    }
  }

  /** Save a source page's extracted markdown to disk. */
  async saveSource(sessionId: string, url: string, title: string, markdown: string): Promise<void> {
    this.validateId(sessionId);
    const sourcesDir = path.join(this.dir, sessionId, 'sources');
    await fs.mkdir(sourcesDir, { recursive: true });

    const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
    const frontmatter = [
      '---',
      `url: ${url}`,
      `title: "${title.replace(/"/g, '\\"')}"`,
      `fetchedAt: ${new Date().toISOString()}`,
      '---',
      '',
    ].join('\n');

    await fs.writeFile(path.join(sourcesDir, `${hash}.md`), frontmatter + markdown, 'utf-8');
    log.debug('Source saved', { sessionId, url });
  }

  /** Save the final report to disk. Returns the file path. */
  async saveReport(
    sessionId: string,
    report: string,
    metadata: { topic: string; depth: string; createdAt: string; sourcesCount: number; pagesVisited: number },
  ): Promise<string> {
    this.validateId(sessionId);
    const sessionDir = path.join(this.dir, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    const reportPath = path.join(sessionDir, 'report.md');
    const frontmatter = [
      '---',
      `topic: "${metadata.topic.replace(/"/g, '\\"')}"`,
      `depth: ${metadata.depth}`,
      `sessionId: ${sessionId}`,
      `createdAt: ${metadata.createdAt}`,
      `sourcesCount: ${metadata.sourcesCount}`,
      `pagesVisited: ${metadata.pagesVisited}`,
      '---',
      '',
    ].join('\n');

    await fs.writeFile(reportPath, frontmatter + report, 'utf-8');
    log.info('Report saved', { sessionId, path: reportPath });
    return reportPath;
  }

  private filePath(sessionId: string): string {
    return path.join(this.dir, `${sessionId}.json`);
  }

  private validateId(sessionId: string): void {
    if (!UUID_RE.test(sessionId)) {
      throw new Error(`Invalid session ID format: ${sessionId}`);
    }
  }
}
