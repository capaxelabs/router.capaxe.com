import type { Context, Env, MiddlewareHandler, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from '../db/schema'

export const getDb = (): MiddlewareHandler => {
    return createMiddleware<Env>(async (ctx: Context, next: Next) => {
        if (!ctx.get('db')) {
            console.log('Creating database connection', `${ctx}`)
            console.log('Creating database connection', `${ctx.env.TURSO_DATABASE_URL} ${ctx.env.TURSO_AUTH_TOKEN}`)
            const client = createClient({
                url: ctx.env.TURSO_DATABASE_URL,
                authToken: ctx.env.TURSO_AUTH_TOKEN,
              })

            console.log('Creating database connection', `${ctx.env.TURSO_DATABASE_URL} ${ctx.env.TURSO_AUTH_TOKEN}`)
            ctx.set('db', drizzle(client, { schema }));
        }

        await next();
    });
}