// Links to things kept elsewhere (a document in Google Drive, a gift idea in a shop), shared by Documents and Lists.
// Whether a link is one we accept (http or https only) is isHttpUrl in lib/formFields.ts.

/** Where a link goes, to show beside it ("drive.google.com", "amazon.com"); empty if it isn't a link. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
