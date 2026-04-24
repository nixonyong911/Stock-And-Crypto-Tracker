import { cn } from "@/lib/utils";

type GradientTextVariant = "brand" | "blue" | "cyan" | "purple";

interface GradientTextProps {
  children: React.ReactNode;
  variant?: GradientTextVariant;
  className?: string;
  as?: "span" | "p" | "h1" | "h2" | "h3";
}

const variantStyles: Record<GradientTextVariant, string> = {
  brand: "from-[var(--brand)] to-[var(--brand-ink)]",
  blue: "from-[var(--brand)] to-[var(--brand-ink)]",
  cyan: "from-cyan-400 to-blue-500",
  purple: "from-purple-400 to-pink-500",
};

export function GradientText({
  children,
  variant = "brand",
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
