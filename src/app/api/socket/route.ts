import { NextRequest } from "next/server";
import { initSocketServer } from "@/lib/socket-server";
import { createServer } from "http";

let io: any = null;

export async function GET(req: NextRequest) {
  if (!io) {
    // In a real Next.js app, you need to get the server from the request context
    // For simplicity, we use a global variable to store the socket server.
    // This works because Next.js runs in a single process in production.
    const httpServer = (global as any).__httpServer || createServer();
    (global as any).__httpServer = httpServer;
    io = initSocketServer(httpServer);
  }
  return new Response("Socket server initialized", { status: 200 });
}
