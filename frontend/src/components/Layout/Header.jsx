import { Bell, RefreshCw } from "lucide-react";
import { useAuth } from "../../store/AuthContext";

export default function Header({ title, subtitle, onRefresh }) {
  const { user } = useAuth();

  return (
    <header className="flex items-center justify-between mb-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-ink leading-tight">{title}</h1>
        {subtitle && <p className="text-ink/50 text-sm mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="btn-ghost flex items-center gap-2 text-sm"
          >
            <RefreshCw size={15} />
          </button>
        )}
        <div className="glass flex items-center gap-3 px-4 py-2 rounded-2xl">
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
            <span className="text-white text-xs font-semibold">
              {user?.full_name?.[0]?.toUpperCase()}
            </span>
          </div>
          <span className="text-sm font-medium text-ink/70 hidden sm:block">
            {user?.full_name}
          </span>
        </div>
      </div>
    </header>
  );
}