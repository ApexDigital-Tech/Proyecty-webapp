import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';
import { logger } from '../lib/logger.ts';

// Check if Redis should be enabled (production or explicitly provided URL)
const isRedisEnabled = process.env.NODE_ENV === 'production' || !!process.env.REDIS_URL;

// Setup Redis Client
export const redisClient = isRedisEnabled ? createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
}) : null;

if (redisClient) {
  redisClient.on('error', (err) => logger.error('Redis Client Error', err));
  redisClient.on('ready', () => logger.info('Redis Client Connected'));
  redisClient.connect().catch(console.error);
}

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
  }) : undefined, // Fallback to MemoryStore
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per minute
  message: { error: 'Límite de solicitudes de IA excedido. Intenta de nuevo más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: 'rl:ai:',
  }) : undefined, // Fallback to MemoryStore
});
