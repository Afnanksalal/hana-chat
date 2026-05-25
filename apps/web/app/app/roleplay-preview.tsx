import type { ReactNode } from "react";

export function renderRoleplayPreview(content: string): ReactNode[] {
  const preview = content.replace(/\s+/g, " ").trim();
  const parts = preview.split(/(\*[^*\n]{1,120}\*)/g);

  return parts.map((part, index) => {
    if (!part) {
      return null;
    }

    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={`${part}-${index}`}>{part.slice(1, -1)}</em>;
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}
