import Link from "next/link";
import Image from "next/image";

interface LogoProps {
  variant?: "full" | "horizontal" | "symbol" | "wordmark" | "footer" | "header";
  className?: string;
}

export default function Logo({ variant = "horizontal", className = "" }: LogoProps) {
  const getImageSize = () => {
    switch (variant) {
      case "header": return 48;
      case "footer": return 32;
      case "full": return 40;
      default: return 32;
    }
  };

  const size = getImageSize();
  const iconSize = variant === "header" ? "w-12 h-12" : "w-8 h-8";

  const icon = variant === "header" ? (
    <div className={`${iconSize} bg-zrp-red rounded-full flex items-center justify-center flex-shrink-0`}>
      <Image src="/logo.png" alt="ZRP" width={48} height={48} className="object-contain" />
    </div>
  ) : (
    <div className={`${iconSize} bg-zrp-red rounded-full flex items-center justify-center flex-shrink-0`}>
      <Image src="/logo.png" alt="ZRP" width={size} height={size} className="object-contain" />
    </div>
  );

  if (variant === "symbol") {
    return <div className={`flex items-center justify-center ${className}`}>{icon}</div>;
  }

  if (variant === "wordmark") {
    return (
      <div className={className}>
        <span className="font-orbitron font-bold text-2xl text-zrp-red">ZRP</span>
      </div>
    );
  }

  if (variant === "header") {
    return (
      <Link href="/" className={`flex items-center gap-3 ${className}`}>
        {icon}
        <span className="font-orbitron font-bold text-3xl text-zrp-red">ZRP</span>
      </Link>
    );
  }

  if (variant === "footer") {
    return (
      <Link href="/" className={`flex items-center gap-2 ${className}`}>
        {icon}
        <span className="font-orbitron font-bold text-xl text-zrp-red">ZRP</span>
      </Link>
    );
  }

  if (variant === "full") {
    return (
      <Link href="/" className={`flex flex-col items-center ${className}`}>
        <div className="flex items-center gap-2">
          {icon}
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
      {icon}
      <span className="font-orbitron font-bold text-xl text-zrp-red">ZRP</span>
      <span className="text-xs text-zrp-charcoal dark:text-zrp-silver font-inter hidden sm:inline">
        LAUNCH · BUILD · CONNECT
      </span>
    </Link>
  );
}
