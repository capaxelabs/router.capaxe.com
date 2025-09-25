import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from '../db/schema'
import { CloudflareBindings, ContextVariables } from '../types/env'

export const getDb = (): MiddlewareHandler<{ Bindings: CloudflareBindings; Variables: ContextVariables }> => {
    return createMiddleware(async (ctx, next) => {
        if (!ctx.get('db')) {
            const client = createClient({
                url: ctx.env.TURSO_DATABASE_URL,
                authToken: ctx.env.TURSO_AUTH_TOKEN,
              })

            ctx.set('db', drizzle(client, { schema }));
        }

        await next();
    });
}