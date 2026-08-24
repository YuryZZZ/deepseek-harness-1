/** Package-owned invariant companion for the LangGraph plugin. @module @deepseek-ai/dsh-langgraph/invariant */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-langgraph'

/** Cordis companion plugin name. */
export const name = 'langgraph-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the plugin registers a prompt section and pure-analysis
 * tools; disposal is proven by their effect-based registration.
 */
const install: InvariantInstaller = () => {}

/**
 * Register the LangGraph invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
