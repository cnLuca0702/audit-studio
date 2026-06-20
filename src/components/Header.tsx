"use client";

import { Home, Sparkles, Globe, Monitor, Settings, Plus } from "lucide-react";

export type AppMode = "app" | "agent" | "platform";

interface HeaderProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onOpenSettings: () => void;
}

export default function Header({ mode, onModeChange, onOpenSettings }: HeaderProps) {
  return (
    <header className="h-10 flex items-center justify-between px-4 bg-[#e8e8e8] border-b border-[#d0d0d0] select-none">
      {/* Left: Window controls + Nav */}
      <div className="flex items-center gap-3">
        {/* Logo */}
        <svg width="90" height="24" viewBox="0 0 90 24" fill="none" className="mr-1" xmlns="http://www.w3.org/2000/svg">
          <text x="0" y="18" fontFamily="'SF Pro Display', 'Inter', 'Helvetica Neue', Arial, sans-serif" fontSize="17" fontWeight="700" letterSpacing="-0.5">
            <tspan fill="#3b82f6">Ki</tspan><tspan fill="#333">ankun</tspan>
          </text>
        </svg>
        {/* Mode tabs */}
        <nav className="flex items-center gap-1">
          <button
            onClick={() => onModeChange("app")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              mode === "app"
                ? "text-[#333] bg-white/80 shadow-sm"
                : "text-[#666] hover:bg-white/60"
            }`}
          >
            <Home size={14} />
            <span>应用模式</span>
          </button>
          <button
            onClick={() => onModeChange("agent")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              mode === "agent"
                ? "text-[#333] bg-white/80 shadow-sm"
                : "text-[#666] hover:bg-white/60"
            }`}
          >
            <Sparkles size={14} />
            <span>智能模式</span>
          </button>
          <button
            onClick={() => onModeChange("platform")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              mode === "platform"
                ? "text-[#333] bg-white/80 shadow-sm"
                : "text-[#666] hover:bg-white/60"
            }`}
          >
            <Globe size={14} />
            <span>开发模式</span>
          </button>
        </nav>
      </div>

      {/* Right: Window controls */}
      <div className="flex items-center gap-2">
        <button className="p-1.5 rounded-md text-[#666] hover:bg-white/60 transition-colors">
          <Plus size={16} />
        </button>
        <button className="p-1.5 rounded-md text-[#666] hover:bg-white/60 transition-colors">
          <Monitor size={16} />
        </button>
        <button
          className="p-1.5 rounded-md text-[#666] hover:bg-white/60 transition-colors"
          onClick={onOpenSettings}
        >
          <Settings size={16} />
        </button>
      </div>
    </header>
  );
}
