"use client"

import Link from "next/link"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { usePathname } from "next/navigation"
import { useAccount } from "wagmi"
import { cn } from "@/lib/utils"
import { Github } from "lucide-react"

const NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "My Account", href: "/user" },
  { label: "Swap", href: "/swap" },
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

        <div className="flex items-center gap-3">
          <a
            href="https://github.com/tomazzi14/TrancheFi-Hook"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors"
          >
            <Github className="h-4.5 w-4.5" />
          </a>
          {isConnected && (
            <ConnectButton
              chainStatus="icon"
              showBalance={false}
              accountStatus="address"
            />
          )}
        </div>
      </div>
    </header>
  )
}
