import {
  Home,
  Boxes,
  ShoppingBag,
  Receipt,
  ArrowLeftRight,
  Cpu,
  Handshake,
  Users,
  Wallet,
  BarChart3,
  Lightbulb,
  Settings,
  PackagePlus,
  ShoppingCart,
  Wrench,
  HandCoins,
  FileMinus,
  ScanLine,
} from "lucide-react";
import type { NavKey } from "./nav";

export const NAV_ICONS: Record<NavKey, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  home: Home,
  stock: Boxes,
  purchases: ShoppingBag,
  sales: Receipt,
  trades: ArrowLeftRight,
  builds: Cpu,
  deals: Handshake,
  contacts: Users,
  finance: Wallet,
  reports: BarChart3,
  insights: Lightbulb,
  settings: Settings,
};

export const QUICK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  item: PackagePlus,
  purchase: ShoppingCart,
  sale: Receipt,
  trade: ArrowLeftRight,
  build: Wrench,
  payment: HandCoins,
  expense: FileMinus,
  move: ScanLine,
};
