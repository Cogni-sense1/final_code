import { handle } from 'hono/aws-lambda';
import { createApp } from './app';

/** API Gateway HTTP API -> Lambda. */
export const handler = handle(createApp());
