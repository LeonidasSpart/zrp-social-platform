import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export function useKeyboardShortcuts() {
  const router = useRouter();
  const { data: session } = useSession();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only trigger if not in input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      // N = New Post
      if (e.key === "n" && session) {
        e.preventDefault();
        // open new post modal (you can expose a global state or ref)
        // For simplicity, dispatch a custom event
        window.dispatchEvent(new CustomEvent("open-new-post"));
      }

      // L = Like focused post (we'll need to track focused post)
      // We can implement with a ref, but keep it simple:
      // you can use a global state or context.
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [session]);
}
