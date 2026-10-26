"use client";

import { LinkOutlined } from "@ant-design/icons";
import { linkHost } from "@/lib/links";

/**
 * A link to something kept elsewhere (a gift idea's page in a shop, a document in Google Drive): one click opens it in a
 * new tab. It shows its label, or else where it goes ("amazon.com"), so people can see before they click.
 */
export default function LinkButton({ url, label, name }: { url: string; label?: string | null; name?: string }) {
  const host = linkHost(url);
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="link-button" aria-label={name ? `Open ${name} (${host})` : undefined} title={url}>
      <LinkOutlined aria-hidden />
      <span>{label || host}</span>
    </a>
  );
}
