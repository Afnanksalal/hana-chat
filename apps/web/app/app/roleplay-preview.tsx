import { Fragment, type ReactNode } from "react";

interface RoleplayTextOptions {
  collapseWhitespace?: boolean;
  actionMaxLength?: number;
}

export function renderRoleplayPreview(content: string): ReactNode[] {
  return renderRoleplayText(content, { collapseWhitespace: true, actionMaxLength: 120 });
}

export function renderRoleplayContent(content: string): ReactNode[] {
  return renderRoleplayText(content, { actionMaxLength: 220 });
}

export function renderRoleplayText(
  content: string,
  options: RoleplayTextOptions = {},
): ReactNode[] {
  const text = options.collapseWhitespace ? content.replace(/\s+/g, " ").trim() : content;
  const actionMaxLength = Math.max(1, Math.min(500, options.actionMaxLength ?? 220));
  const parts = text.split(new RegExp(`(\\*[^*\\n]{1,${actionMaxLength}}\\*)`, "g"));

  return parts.map((part, index) => {
    if (!part) {
      return null;
    }

    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={`${part}-${index}`}>{part.slice(1, -1)}</em>;
    }

    if (!options.collapseWhitespace && part.includes("\n")) {
      return part.split("\n").map((line, lineIndex, lines) => (
        <Fragment key={`${index}-${lineIndex}`}>
          {line}
          {lineIndex < lines.length - 1 ? <br /> : null}
        </Fragment>
      ));
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}
