import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: required("DATABASE_URL"),
  // Optional by design: without it, notifications dispatch synchronously instead of
  // through the queue (see src/queue/queue-connection.ts).
  redisUrl: process.env.REDIS_URL,
};
