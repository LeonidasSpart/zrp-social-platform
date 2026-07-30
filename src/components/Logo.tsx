import Link from "next/link";
import Image from "next/image";

interface LogoProps {
  variant?: "full" | "horizontal" | "symbol" | "wordmark" | "footer";
  className?: string;
}

export default function Logo({ variant = "horizontal", className = "" }: LogoProps) {
  const size = variant === "footer" ? 32 : variant === "full" ? 40 : 32;

  const symbol = (
    <div className="relative w-8 h-8 flex-shrink-0">
      <Image
        src="/logo.png"
        alt="ZRP"
        width={size}
        height={size}
        className="object-contain"
      />
    </div>
  );

  if (variant === "symbol") {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        {symbol}
      </div>
    );
  }

  if (variant === "wordmark") {
    return (
      <div className={`${className}`}>
        <span className="font-orbitron font-bold text-2xl text-zrp-red">ZRP</span>
      </div>
    );
  }

  if (variant === "footer") {
    return (
      <Link href="/" className={`flex items-center gap-2 ${className}`}>
        {symbol}
        <span className="font-orbitron font-bold text-xl text-zrp-red">ZRP</span>
      </Link>
    );
  }

  if (variant === "full") {
    return (
      <Link href="/" className={`flex flex-col items-center ${className}`}>
        <div className="flex items-center gap-2">
          <div className="relative w-10 h-10">
            <Image
              src="/logo.png"
              alt="ZRP"
              width={40}
              height={40}
              className="object-contain"
            />
          </div>
          <span className="font-orbitron font-bold text-2xl text-zrp-red">ZRP</span>
        </div>
        <span className="text-[10px] text-zrp-charcoal dark:text-zrp-silver font-inter tracking-wider">
          LAUNCH · BUILD · CONNECT
        </span>
      </Link>
    );
  }

  // Horizontal (default)
  return (
    <Link href="/" className={`flex items-center gap-2 ${className}`}>
      {symbol}
      <span className="font-orbitron font-bold text-xl text-zrp-red">ZRP</span>
      <span className="text-xs text-zrp-charcoal dark:text-zrp-silver font-inter hidden sm:inline">
        LAUNCH · BUILD · CONNECT
      </span>
    </Link>
  );
}
