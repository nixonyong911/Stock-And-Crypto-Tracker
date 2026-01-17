import { cn } from "@/lib/utils";

type GradientTextVariant = "blue" | "cyan" | "purple";

interface GradientTextProps {
  children: React.ReactNode;
  variant?: GradientTextVariant;
  className?: string;
  as?: "span" | "p" | "h1" | "h2" | "h3";
}

const variantStyles: Record<GradientTextVariant, string> = {
  blue: "from-[var(--gradient-from)] to-[var(--gradient-to)]",
  cyan: "from-cyan-400 to-blue-500",
  purple: "from-purple-400 to-pink-500",
};

export function GradientText({
  children,
  variant = "blue",
  className,
  as: Component = "span",
}: GradientTextProps) {
  return (
    <Component
      className={cn(
        "bg-gradient-to-r bg-clip-text text-transparent",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </Component>
  );
}
