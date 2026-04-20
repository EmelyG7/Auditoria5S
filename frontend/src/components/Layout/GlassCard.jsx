import { cn } from "../../utils/cn";

export default function GlassCard({ children, className, hover = true, padding = true }) {
  return (
    <div
      className={cn(
        "glass rounded-3xl transition-all duration-300",
        padding && "p-6",
        hover && "hover:-translate-y-0.5 hover:shadow-glass-hover",
        "animate-fade-up",
        className
      )}
    >
      {children}
    </div>
  );
}