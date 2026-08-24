/** Package-owned invariant companion for the Langfuse ingest backend. @module @deepseek-ai/dsh-langfuse-ingest/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-langfuse-ingest'

/** Cordis companion plugin name. */
export const name = 'langfuse-ingest-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: the backend enqueues records and exports best-effort; disposal is proven by the coordinator's own lifecycle. */
const install: InvariantInstaller = () => {}

/**
 * Register the Langfuse ingest invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
