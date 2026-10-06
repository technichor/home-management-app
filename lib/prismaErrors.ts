/** A unique constraint refused the write (Prisma's P2002), e.g. two people taking the same email at once. */
export const isUniqueViolation = (e: unknown): boolean => (e as { code?: string } | null)?.code === "P2002";
