import { ContactsOutlined, HomeOutlined, MessageOutlined, UnorderedListOutlined } from "@ant-design/icons";
import type { ReactNode } from "react";

export type NavModule = { key: string; label: string; href: string; icon: ReactNode };

/**
 * The app's modules, in nav order. Add a module by adding one entry (and its pages under /<key>).
 * The first four show in the phone tab bar; any more appear under "More".
 */
export const MODULES: NavModule[] = [
  { key: "home", label: "Home", href: "/home", icon: <HomeOutlined aria-hidden /> },
  { key: "contacts", label: "Contacts", href: "/contacts", icon: <ContactsOutlined aria-hidden /> },
  { key: "lists", label: "Lists", href: "/lists", icon: <UnorderedListOutlined aria-hidden /> },
  { key: "messages", label: "Messages", href: "/messages", icon: <MessageOutlined aria-hidden /> },
];

export const TAB_BAR_COUNT = 4;
