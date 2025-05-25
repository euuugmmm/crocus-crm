// utils/logger.ts

type LogLevel = 'info' | 'warn' | 'error';

class Logger {
  private log(level: LogLevel, message: string, meta?: any) {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? JSON.stringify(meta) : '';
    
    console[level](`[${timestamp}] ${level.toUpperCase()}: ${message} ${metaStr}`);
    
    // Here you could also send logs to a service like Sentry, LogRocket, etc.
  }

  info(message: string, meta?: any) {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: any) {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: any) {
    this.log('error', message, meta);
  }
}

export const logger = new Logger();