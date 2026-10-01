import React from "react";
import { vi } from "vitest";

// Component tests opt in to jsdom with `// @vitest-environment jsdom`; server-side tests stay in node.
if (typeof window !== "undefined") {
  await import("@testing-library/jest-dom/vitest");

  // antd needs these browser APIs, which jsdom lacks.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as any).ResizeObserver = ResizeObserverStub;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  if (!window.Blob.prototype.text) {
    window.Blob.prototype.text = function () {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    };
  }
  const originalGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = (el: Element) => originalGetComputedStyle(el);
}

// next/link needs the app router; a plain anchor is enough for tests.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={typeof href === "string" ? href : String(href)} {...rest}>
      {children}
    </a>
  ),
}));
