"use client";

import Link from "next/link";
import { parseContent, getInternalPath, type ContentPart } from "@/lib/parse-content";

interface ParsedContentProps {
  content: string;
  linkClassName?: string;
  urlClassName?: string;
  // Stops the tap/click from also firing a parent container's own
  // onClick (e.g. a message bubble or post body that navigates
  // somewhere on tap) - on by default, since that parent-tap behavior
  // is what every existing call site (PostCard included) already
  // assumes a link tap should override, not add to.
  stopPropagation?: boolean;
}

function renderPart(
  part: ContentPart,
  index: number,
  linkClassName: string,
  urlClassName: string,
  stopPropagation: boolean
) {
  const onClick = stopPropagation ? (e: React.MouseEvent) => e.stopPropagation() : undefined;

  if (part.type === "hashtag") {
    const tag = part.value.slice(1);
    return (
      <Link key={index} href={`/hashtag/${tag}`} className={linkClassName} onClick={onClick}>
        {part.value}
      </Link>
    );
  }

  if (part.type === "mention") {
    const username = part.value.slice(1);
    return (
      <Link key={index} href={`/profile/${username}`} className={linkClassName} onClick={onClick}>
        {part.value}
      </Link>
    );
  }

  if (part.type === "url") {
    const href = part.value.startsWith("http") ? part.value : `https://${part.value}`;
    const internalPath = getInternalPath(part.value);

    // A URL that names one of ZRP's own pages navigates inside the SPA
    // (no full reload, correct back-button history, session/composer
    // state untouched) rather than opening a second tab to itself.
    if (internalPath) {
      return (
        <Link key={index} href={internalPath} className={linkClassName} onClick={onClick}>
          {part.value}
        </Link>
      );
    }

    return (
      <a
        key={index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={urlClassName}
        onClick={onClick}
      >
        {part.value}
      </a>
    );
  }

  return <span key={index}>{part.value}</span>;
}

// Renders @mentions, #hashtags and http(s)/www URLs found in
// user-generated text as real, interactive links - the shared renderer
// for any surface that just needs "linkify this plain text", such as
// messages and comments. Surfaces with extra behavior layered on top of
// the same parts (PostCard's link-preview suppression) keep their own
// render loop and only share parseContent() from "@/lib/parse-content".
export default function ParsedContent({
  content,
  linkClassName = "text-zrp-red hover:underline",
  urlClassName = "text-blue-600 dark:text-blue-400 hover:underline break-all",
  stopPropagation = true,
}: ParsedContentProps) {
  const parts = parseContent(content);
  return (
    <>
      {parts.map((part, index) =>
        renderPart(part, index, linkClassName, urlClassName, stopPropagation)
      )}
    </>
  );
}
