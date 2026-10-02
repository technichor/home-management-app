// A post-login destination must be a path on this site, never another origin.
export function safeNext(value: FormDataEntryValue | string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : undefined;
}
