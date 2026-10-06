/** A unique constraint refused the write (Prisma's P2002), e.g. two people taking the same email at once. */
export const isUniqueViolation = (e: unknown): boolean => (e as { code?: string } | null)?.code === "P2002";

/**
 * Run a write once more if it lost a race to create the same unique row. Meant for "created on first read" upserts:
 * Prisma's upsert is not atomic, so two first requests at once can both try to create; the second attempt finds the row.
 */
export async function retryOnUniqueViolation<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (e) {
    if (isUniqueViolation(e)) return write();
    throw e;
  }
}
