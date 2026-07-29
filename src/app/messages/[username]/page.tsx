"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";

interface Message {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  sender: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string;
  };
}

export default function ChatPage({ params }: { params: { username: string } }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [partner, setPartner] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchMessages();
      fetchPartner();
    }
  }, [params.username, status]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchPartner = async () => {
    try {
      const res = await fetch(`/api/users/${params.username}`);
      if (res.ok) {
        const data = await res.json();
        setPartner(data);
      }
    } catch (error) {
      console.error("Error fetching partner:", error);
    }
  };

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/messages/${partner?.id || params.username}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !partner) return;

    setSending(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newMessage,
          receiverId: partner.id,
        }),
      });

      if (res.ok) {
        const message = await res.json();
        setMessages([...messages, message]);
        setNewMessage("");
        inputRef.current?.focus();
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  };

  // Poll for new messages every 5 seconds
  useEffect(() => {
    if (!partner) return;
    const interval = setInterval(() => {
      fetchMessages();
    }, 5000);
    return () => clearInterval(interval);
  }, [partner]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="max-w-2xl mx-auto py-4 px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 font-medium">User not found</p>
          <Link href="/messages" className="text-blue-600 hover:underline text-sm mt-2 block">
            ← Back to messages
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4 h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white rounded-t-lg shadow-sm border border-gray-200 p-4 flex items-center gap-3">
        <Link href="/messages" className="text-gray-500 hover:text-gray-700 transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Link href={`/profile/${partner.username}`}>
          <div className="flex items-center gap-3 hover:bg-gray-50 rounded-lg p-1 -ml-1 transition">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold flex-shrink-0">
              {partner.name?.[0] || "?"}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{partner.name}</p>
              <p className="text-xs text-gray-500">@{partner.username}</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Messages */}
      <div className="flex-1 bg-gray-50 border-x border-gray-200 p-4 overflow-y-auto space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 mt-8">
            <p>No messages yet</p>
            <p className="text-sm">Say hello to {partner.name}!</p>
          </div>
        ) : (
          messages.map((message) => {
            const isOwn = message.senderId === session?.user?.id;
            return (
              <div
                key={message.id}
                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                    isOwn
                      ? "bg-blue-600 text-white rounded-br-none"
                      : "bg-white border border-gray-200 text-gray-800 rounded-bl-none"
                  }`}
                >
                  <p className="text-sm break-words">{message.content}</p>
                  <p className={`text-[10px] mt-1 ${isOwn ? "text-blue-200" : "text-gray-400"}`}>
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="bg-white rounded-b-lg shadow-sm border border-gray-200 p-3 flex gap-2"
      >
        <input
          ref={inputRef}
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder={`Message ${partner.name}...`}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || sending}
          className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}
