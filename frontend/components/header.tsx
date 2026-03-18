"use client"

import Link from "next/link"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { usePathname } from "next/navigation"
import { useAccount } from "wagmi"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "My Account", href: "/user" },
  { label: "Swap", href: "/swap" },
  { label: "Simulator", href: "/simulator" },
  { label: "Reactive", href: "/reactive" },
]

export function Header() {
  const pathname = usePathname()
  const { isConnected } = useAccount()

  return (
    <header className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-1 font-bold text-lg">
            <span className="text-violet-400">Tranche</span>
            <span className="text-white">Fi</span>
          </Link>

          {isConnected && (
            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    pathname === item.href
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        {isConnected && (
          <ConnectButton
            chainStatus="icon"
            showBalance={false}
            accountStatus="address"
          />
        )}
      </div>
    </header>
  )
}
