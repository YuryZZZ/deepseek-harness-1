/** Package-owned invariant companion for the Langfuse tool. @module @deepseek-ai/dsh-tool-langfuse/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tool-langfuse'

/** Cordis companion plugin name. */
export const name = 'tool-langfuse-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/** No runtime invariant: the tools register as effects, so disposal is proven by the HMR-safety test. */
const install: InvariantInstaller = () => {}

/**
 * Register the Langfuse tool invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
