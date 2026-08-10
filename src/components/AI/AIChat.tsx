"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Send, Sparkles, Loader2, Bot, User, Plus } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export default function AIChat() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setLoading(true);

    // Add user message
    setMessages((prev) => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        role: "user",
        content: userMessage,
        createdAt: new Date().toISOString(),
      },
    ]);

    // Add temporary assistant message for streaming
    const tempAssistantId = `temp-assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempAssistantId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          conversationId,
          stream: true,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to get response");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      let fullContent = "";
      let messageId = "";
      let newConversationId = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.delta) {
                fullContent += data.delta;
                // Update the temporary assistant message
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === tempAssistantId
                      ? { ...msg, content: fullContent }
                      : msg
                  )
                );
              }

              if (data.done) {
                messageId = data.messageId;
                newConversationId = data.conversationId;
                setConversationId(newConversationId);
                setRemaining(data.remaining);

                // Replace temporary message with permanent one
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === tempAssistantId
                      ? { ...msg, id: messageId }
                      : msg
                  )
                );
              }

              if (data.error) {
                throw new Error(data.error);
              }
            } catch (parseError) {
              // Ignore parse errors for non-JSON lines
            }
          }
        }
      }
    } catch (error) {
      console.error("AI error:", error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempAssistantId
            ? {
                ...msg,
                content:
                  "⚠️ Sorry, I couldn't generate a response. Please try again.",
              }
            : msg
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setRemaining(null);
  };

  const plan = session?.user?.plan || "free";
  const planLabels: Record<string, string> = {
    free: "Free (10/day)",
    pro: "Pro (50/day)",
    business: "Business (200/day)",
    enterprise: "Enterprise (1000/day)",
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zrp-deepBlack rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zrp-red/10 rounded-full">
            <Sparkles className="w-5 h-5 text-zrp-red" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">ZRP AI</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Powered by DeepSeek
              {remaining !== null && ` · ${remaining} remaining today`}
            </p>
          </div>
        </div>
        <button
          onClick={startNewChat}
          className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
          title="New chat"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] max-h-[500px]">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
            <Bot className="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" />
            <h3 className="font-medium text-gray-700 dark:text-gray-300">
              Ask ZRP AI anything
            </h3>
            <p className="text-sm max-w-xs mt-1">
              Get help with posts, learn about ZRP, or just chat!
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <button
                onClick={() => setInput("What is ZRP Social?")}
                className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition"
              >
                What is ZRP?
              </button>
              <button
                onClick={() => setInput("Write a post about charity")}
                className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition"
              >
                Write about charity
              </button>
              <button
                onClick={() => setInput("How does the 35% charity work?")}
                className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition"
              >
                35% charity explained
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={msg.id || idx}
              className={`flex gap-3 ${
                msg.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === "user"
                    ? "bg-zrp-red text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                {msg.role === "user" ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  msg.role === "user"
                    ? "bg-zrp-red text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-gray-500" />
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask ZRP AI anything..."
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="px-4 py-2 bg-zrp-red text-white rounded-lg font-medium hover:bg-zrp-darkRed transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">
          🧡 35% of ZRP AI revenue goes to charity.
        </p>
      </div>
    </div>
  );
}
