/** Package-owned invariant companion for the Langfuse seam. @module @deepseek-ai/dsh-langfuse/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-langfuse'

/** Cordis companion plugin name. */
export const name = 'langfuse-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the client is stateless and the analyzer is pure;
 * reachability is already surfaced through the live status snapshot.
 */
const install: InvariantInstaller = () => {}

/**
 * Register the Langfuse invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
