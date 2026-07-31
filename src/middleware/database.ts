import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { createDatabase } from '../db'
import { CloudflareBindings, ContextVariables } from '../types/env'

export const getDb = (): MiddlewareHandler<{ Bindings: CloudflareBindings; Variables: ContextVariables }> => {
    return createMiddleware(async (ctx, next) => {
        if (!ctx.get('db')) {
            ctx.set('db', createDatabase(ctx.env.DB));
        }

        await next();
    });
}
