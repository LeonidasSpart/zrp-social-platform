"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { USDC_MINT, PLATFORM_WALLET_PUBLIC_KEY, getConnection } from "@/lib/solana";

interface TipModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipientId: string;
  recipientName: string;
  onTipSent: () => void;
}

const Button = ({
  children,
  onClick,
  variant = "default",
  disabled,
  className = "",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "outline" | "destructive";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit" | "reset";
}) => {
  const base =
    "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 disabled:pointer-events-none px-4 py-2";
  const variants = {
    default: "bg-red-600 text-white hover:bg-red-700",
    outline: "border border-gray-300 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800",
    destructive: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant] || variants.default} ${className}`}
    >
      {children}
    </button>
  );
};

const Input = ({
  value,
  onChange,
  placeholder,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) => (
  <input
    type="number"
    step="0.01"
    min="1"
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    disabled={disabled}
    className={`flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 ${className}`}
  />
);

const Textarea = ({
  value,
  onChange,
  placeholder,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) => (
  <textarea
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    disabled={disabled}
    className={`flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 ${className}`}
  />
);

export default function TipModal({
  isOpen,
  onClose,
  recipientId,
  recipientName,
  onTipSent,
}: TipModalProps) {
  const [amount, setAmount] = useState<string>("5");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { publicKey, sendTransaction, connected } = useWallet();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!connected || !publicKey) {
      setError("Please connect your wallet first.");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Please enter a valid amount.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // ─── Get connection ─────────────────────────────────────────────
      const connection = getConnection();

      // ─── Compute token accounts ─────────────────────────────────────
      const fromTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        publicKey
      );
      const toTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        PLATFORM_WALLET_PUBLIC_KEY
      );

      // ─── Build transaction ──────────────────────────────────────────
      const tx = new Transaction();

      // Check if sender's token account exists
      const fromAccountInfo = await connection.getAccountInfo(fromTokenAccount);
      if (!fromAccountInfo) {
        // Create the associated token account for the sender
        tx.add(
          createAssociatedTokenAccountInstruction(
            publicKey, // payer
            fromTokenAccount, // ata
            publicKey, // owner
            USDC_MINT // mint
          )
        );
      }

      // Check if platform's token account exists – assume it exists; if not, show error
      const toAccountInfo = await connection.getAccountInfo(toTokenAccount);
      if (!toAccountInfo) {
        throw new Error(
          "Platform wallet is not set up to receive USDC. Please contact support."
        );
      }

      // Add transfer instruction
      tx.add(
        createTransferInstruction(
          fromTokenAccount,
          toTokenAccount,
          publicKey,
          parsedAmount * 1_000_000 // USDC has 6 decimals
        )
      );

      // ─── Send transaction ──────────────────────────────────────────
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, "confirmed");

      // ─── Call backend to credit the creator ──────────────────────
      const res = await fetch("/api/creator/tip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId,
          amount: parsedAmount,
          message: message.trim() || undefined,
          transactionId: signature,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to credit tip.");
      }

      setSuccess(true);
      setTimeout(() => {
        onTipSent();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Transaction failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg max-w-md w-full p-6 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Send Tip to {recipientName}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="text-center py-8">
            <div className="text-green-500 text-4xl mb-2">✓</div>
            <p className="text-gray-800 dark:text-gray-200 font-medium">
              Tip sent successfully!
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Thank you for supporting {recipientName}.
            </p>
          </div>
        ) : (
          <>
            {!connected ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Connect your Solana wallet to send USDC tips.
                </p>
                <WalletMultiButton className="w-full bg-red-600 text-white rounded-lg py-2 font-medium hover:bg-red-700 transition" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Amount (USDC)
                  </label>
                  <Input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Enter amount"
                    disabled={loading}
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Connected: {publicKey?.toBase58().slice(0, 8)}...
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Message (optional)
                  </label>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Supportive message..."
                    disabled={loading}
                  />
                </div>

                {error && (
                  <div className="text-red-500 text-sm">{error}</div>
                )}

                <div className="flex gap-3 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send Tip"
                    )}
                  </Button>
                </div>

                <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                  10% platform fee · 35% of fees go to charity
                </p>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
