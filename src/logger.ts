/**
 * Simple logger that writes to stderr (stdout is reserved for MCP protocol).
 * Prefixes all messages with timestamp and level.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let minLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function formatMessage(level: LogLevel, component: string, message: string, meta?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${component}]`;
  const metaStr = meta ? ' ' + JSON.stringify(meta) : '';
  return `${prefix} ${message}${metaStr}`;
}

function log(level: LogLevel, component: string, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  process.stderr.write(formatMessage(level, component, message, meta) + '\n');
}

export function createLogger(component: string) {
  return {
    debug: (message: string, meta?: Record<string, unknown>) => log('debug', component, message, meta),
    info: (message: string, meta?: Record<string, unknown>) => log('info', component, message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => log('warn', component, message, meta),
    error: (message: string, meta?: Record<string, unknown>) => log('error', component, message, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
