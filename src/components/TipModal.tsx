"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import {
  PublicKey,
  Transaction,
} from "@solana/web3.js";

import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import {
  getConnection,
  getClientUsdcMint,
  getClientPlatformWallet,
} from "@/lib/solana-client";

/*
 * ============================================================
 * TYPES
 * ============================================================
 */

interface TipModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipientId: string;
  recipientName: string;
  onTipSent: () => void;
}

/*
 * ============================================================
 * BUTTON
 * ============================================================
 */

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
    default:
      "bg-red-600 text-white hover:bg-red-700",

    outline:
      "border border-gray-300 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800",

    destructive:
      "bg-red-600 text-white hover:bg-red-700",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${
        variants[variant] || variants.default
      } ${className}`}
    >
      {children}
    </button>
  );
};

/*
 * ============================================================
 * INPUT
 * ============================================================
 */

const Input = ({
  value,
  onChange,
  placeholder,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement>
  ) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) => (
  <input
    type="number"
    step="0.01"
    min="0.01"
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    disabled={disabled}
    className={`flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 ${className}`}
  />
);

/*
 * ============================================================
 * TEXTAREA
 * ============================================================
 */

const Textarea = ({
  value,
  onChange,
  placeholder,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) => (
  <textarea
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    disabled={disabled}
    maxLength={1000}
    className={`flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 ${className}`}
  />
);

/*
 * ============================================================
 * TIP MODAL
 * ============================================================
 */

export default function TipModal({
  isOpen,
  onClose,
  recipientId,
  recipientName,
  onTipSent,
}: TipModalProps) {
  const [amount, setAmount] =
    useState<string>("5");

  const [message, setMessage] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState(false);

  const {
    publicKey,
    sendTransaction,
    connected,
  } = useWallet();

  /*
   * Don't render when closed.
   */

  if (!isOpen) {
    return null;
  }

  /*
   * ==========================================================
   * SEND TIP
   * ==========================================================
   */

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    setError(null);

    /*
     * ----------------------------------------------------------
     * Wallet validation
     * ----------------------------------------------------------
     */

    if (!connected || !publicKey) {
      setError(
        "Please connect your Solana wallet first."
      );
      return;
    }

    /*
     * ----------------------------------------------------------
     * Amount validation
     * ----------------------------------------------------------
     */

    const parsedAmount =
      Number.parseFloat(amount);

    if (
      !Number.isFinite(parsedAmount) ||
      parsedAmount <= 0
    ) {
      setError(
        "Please enter a valid USDC amount."
      );
      return;
    }

    /*
     * USDC uses 6 decimals.
     */

    const rawAmount =
      Math.round(parsedAmount * 1_000_000);

    if (rawAmount <= 0) {
      setError(
        "The USDC amount is too small."
      );
      return;
    }

    /*
     * Prevent numbers that cannot safely be represented.
     */

    if (
      rawAmount >
      Number.MAX_SAFE_INTEGER
    ) {
      setError(
        "The USDC amount is too large."
      );
      return;
    }

    setLoading(true);

    try {
      /*
       * ========================================================
       * SOLANA CONFIGURATION
       * ========================================================
       *
       * IMPORTANT:
       * These values come from the client-safe module.
       *
       * We DO NOT import "@/lib/solana" here.
       *
       * "@/lib/solana" contains server-only functionality,
       * including the platform private key.
       */

      const connection =
        getConnection();

      const usdcMint =
        getClientUsdcMint();

      const platformWallet =
        getClientPlatformWallet();

      /*
       * ========================================================
       * TOKEN ACCOUNTS
       * ========================================================
       */

      const fromTokenAccount =
        await getAssociatedTokenAddress(
          usdcMint,
          publicKey,
          false,
          TOKEN_PROGRAM_ID
        );

      const toTokenAccount =
        await getAssociatedTokenAddress(
          usdcMint,
          platformWallet,
          false,
          TOKEN_PROGRAM_ID
        );

      /*
       * ========================================================
       * BUILD TRANSACTION
       * ========================================================
       */

      const transaction =
        new Transaction();

      /*
       * --------------------------------------------------------
       * Sender USDC ATA
       * --------------------------------------------------------
       *
       * If the sender does not have a USDC associated token
       * account, create it.
       */

      const fromAccountInfo =
        await connection.getAccountInfo(
          fromTokenAccount
        );

      if (!fromAccountInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            fromTokenAccount,
            publicKey,
            usdcMint,
            TOKEN_PROGRAM_ID
          )
        );
      }

      /*
       * --------------------------------------------------------
       * Platform USDC ATA
       * --------------------------------------------------------
       *
       * We intentionally do NOT create the platform ATA using
       * the user's wallet.
       */

      const toAccountInfo =
        await connection.getAccountInfo(
          toTokenAccount
        );

      if (!toAccountInfo) {
        throw new Error(
          "The ZRP platform wallet is not configured to receive USDC. Please contact support."
        );
      }

      /*
       * ========================================================
       * USDC TRANSFER
       * ========================================================
       */

      transaction.add(
        createTransferInstruction(
          fromTokenAccount,
          toTokenAccount,
          publicKey,
          rawAmount,
          [],
          TOKEN_PROGRAM_ID
        )
      );

      /*
       * ========================================================
       * RECENT BLOCKHASH
       * ========================================================
       */

      const latestBlockhash =
        await connection.getLatestBlockhash(
          "confirmed"
        );

      transaction.recentBlockhash =
        latestBlockhash.blockhash;

      transaction.feePayer =
        publicKey;

      /*
       * ========================================================
       * SEND TRANSACTION
       * ========================================================
       */

      const signature =
        await sendTransaction(
          transaction,
          connection
        );

      /*
       * ========================================================
       * CONFIRM TRANSACTION
       * ========================================================
       */

      await connection.confirmTransaction(
        {
          signature,
          blockhash:
            latestBlockhash.blockhash,
          lastValidBlockHeight:
            latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );

      /*
       * ========================================================
       * CREDIT TIP THROUGH BACKEND
       * ========================================================
       *
       * The backend MUST independently verify the transaction.
       * The browser amount is never trusted by the server.
       */

      const response =
        await fetch(
          "/api/creator/tip",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              recipientId,

              amount:
                parsedAmount,

              message:
                message.trim() || undefined,

              transactionId:
                signature,
            }),
          }
        );

      /*
       * ========================================================
       * READ BACKEND RESPONSE
       * ========================================================
       */

      let data: any = null;

      try {
        data =
          await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "The transaction succeeded, but the tip could not be credited."
        );
      }

      /*
       * ========================================================
       * SUCCESS
       * ========================================================
       */

      setSuccess(true);

      setTimeout(() => {
        onTipSent();
        onClose();

        /*
         * Reset modal state.
         */

        setSuccess(false);
        setMessage("");
        setAmount("5");
        setError(null);
      }, 1500);
    } catch (err: unknown) {
      console.error(
        "Tip transaction error:",
        err
      );

      let errorMessage =
        "Transaction failed.";

      if (err instanceof Error) {
        errorMessage =
          err.message;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  /*
   * ============================================================
   * UI
   * ============================================================
   */

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">

        {/* Header */}

        <div className="mb-4 flex items-center justify-between">

          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Send Tip to {recipientName}
          </h2>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded p-1 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

        </div>

        {/* Success */}

        {success ? (
          <div className="py-8 text-center">

            <div className="mb-2 text-4xl text-green-500">
              ✓
            </div>

            <p className="font-medium text-gray-800 dark:text-gray-200">
              Tip sent successfully!
            </p>

            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Thank you for supporting{" "}
              {recipientName}.
            </p>

          </div>
        ) : (
          <>
            {/* Wallet disconnected */}

            {!connected ? (
              <div className="space-y-4">

                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Connect your Solana wallet
                  to send a USDC tip.
                </p>

                <WalletMultiButton
                  className="w-full rounded-lg bg-red-600 py-2 font-medium text-white transition hover:bg-red-700"
                />

              </div>
            ) : (

              <form
                onSubmit={handleSubmit}
                className="space-y-4"
              >

                {/* Amount */}

                <div>

                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Amount (USDC)
                  </label>

                  <Input
                    value={amount}
                    onChange={(e) =>
                      setAmount(
                        e.target.value
                      )
                    }
                    placeholder="Enter amount"
                    disabled={loading}
                  />

                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Connected:{" "}
                    {publicKey
                      ?.toBase58()
                      .slice(0, 8)}
                    ...
                  </p>

                </div>

                {/* Message */}

                <div>

                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Message (optional)
                  </label>

                  <Textarea
                    value={message}
                    onChange={(e) =>
                      setMessage(
                        e.target.value
                      )
                    }
                    placeholder="Supportive message..."
                    disabled={loading}
                  />

                  <p className="mt-1 text-right text-xs text-gray-400 dark:text-gray-500">
                    {message.length}/1000
                  </p>

                </div>

                {/* Error */}

                {error && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
                    {error}
                  </div>
                )}

                {/* Buttons */}

                <div className="flex justify-end gap-3">

                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={loading}
                  >
                    Cancel
                  </Button>

                  <Button
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send Tip"
                    )}
                  </Button>

                </div>

                {/* Fee information */}

                <p className="text-center text-xs text-gray-400 dark:text-gray-500">
                  10% platform fee · 35% of
                  platform fees go to charity
                </p>

              </form>
            )}
          </>
        )}

      </div>
    </div>
  );
}
