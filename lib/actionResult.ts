/**
 * Expected failures of a server action come back as `{ ok: false, error }`, because production builds hide the
 * message of an error thrown from a server action. Throw a UserError inside `attempt` for those; anything else
 * (a missing session, a database failure) still throws.
 */
export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

export class UserError extends Error {}

export async function attempt<T extends object = object>(fn: () => Promise<T | void>): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...((await fn()) ?? {}) } as ActionResult<T>;
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    throw e;
  }
}
