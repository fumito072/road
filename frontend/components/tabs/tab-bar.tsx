"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Smartphone,
  Banknote,
  Zap,
  Receipt,
  Folder,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type { Tab } from "@/lib/types";

const iconMap: Record<string, LucideIcon> = {
  users: Users,
  smartphone: Smartphone,
  banknote: Banknote,
  zap: Zap,
  receipt: Receipt,
  folder: Folder,
};

interface TabBarProps {
  activeTabId: string | null;
  onSelectTab: (tab: Tab) => void;
  onSettingsClick: (tab: Tab) => void;
  onAddClick?: () => void;
  showAddButton?: boolean;
}

export function TabBar({
  activeTabId,
  onSelectTab,
  onSettingsClick,
  onAddClick,
  showAddButton = false,
}: TabBarProps) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTabs = useCallback(async () => {
    try {
      const data = await apiFetch<Tab[]>("/tabs");
      setTabs(data);
      if (!activeTabId && data.length > 0) {
        onSelectTab(data[0]);
      }
    } catch (err) {
      console.error("Failed to fetch tabs:", err);
    } finally {
      setLoading(false);
    }
  }, [activeTabId, onSelectTab]);

  useEffect(() => {
    fetchTabs();
  }, [fetchTabs]);

  if (loading) {
    return (
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-9 w-24 animate-pulse rounded-sm bg-[#e3e8ef]"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {tabs.map((tab) => {
        const Icon = iconMap[tab.icon ?? ""] ?? Folder;
        const isActive = tab.id === activeTabId;

        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab)}
            className={cn(
              "group relative flex items-center gap-2 rounded-sm px-5 py-3 text-sm font-semibold transition-colors",
              isActive
                ? "border border-[#2f2f31] bg-[#2f2f31] text-white"
                : "border border-[#d4d9df] bg-[#f3f4f6] text-[#6b7685] hover:bg-[#e8ecf1]"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{tab.name}</span>

            {isActive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSettingsClick(tab);
                }}
                className="ml-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-white/20 group-hover:opacity-100"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
            )}
          </button>
        );
      })}
      {showAddButton && onAddClick ? (
        <button
          onClick={onAddClick}
          className="ml-2 flex items-center gap-1 rounded-sm border border-dashed border-[#c5cdd6] px-3 py-3 text-sm text-[#8b95a2] transition-colors hover:bg-[#f3f4f6] hover:text-[#5a6573]"
        >
          <span>追加</span>
        </button>
      ) : null}
    </div>
  );
}
