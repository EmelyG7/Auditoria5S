import { cn } from "../../utils/cn";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function KPICard({ title, value, unit = "", subtitle, icon: Icon, trend, color = "primary", className }) {
  const colorMap = {
    primary:   { bg: "bg-primary/10",   text: "text-primary",   icon: "bg-primary" },
    success:   { bg: "bg-success/10",   text: "text-success",   icon: "bg-success" },
    warning:   { bg: "bg-warning/10",   text: "text-warning",   icon: "bg-warning" },
    danger:    { bg: "bg-danger/10",    text: "text-danger",    icon: "bg-danger" },
    secondary: { bg: "bg-secondary/10", text: "text-secondary", icon: "bg-secondary" },
  };
  const c = colorMap[color] || colorMap.primary;

  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor = trend > 0 ? "text-success" : trend < 0 ? "text-danger" : "text-ink/40";

  return (
    <div className={cn("glass-card animate-fade-up", className)}>
      <div className="flex items-start justify-between mb-4">
        {Icon && (
          <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center", c.icon)}>
            <Icon size={18} className="text-white" />
          </div>
        )}
        {trend !== undefined && (
          <div className={cn("flex items-center gap-1 text-xs font-medium", trendColor)}>
            <TrendIcon size={13} />
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-ink/50 text-xs font-medium uppercase tracking-wide mb-1">{title}</p>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-3xl font-semibold", c.text)}>{value}</span>
        {unit && <span className="text-ink/40 text-sm">{unit}</span>}
      </div>
      {subtitle && <p className="text-ink/40 text-xs mt-1.5">{subtitle}</p>}
    </div>
  );
}