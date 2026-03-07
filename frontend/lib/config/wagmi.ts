import { getDefaultConfig } from "@rainbow-me/rainbowkit"
import { unichainSepolia } from "./chains"

export const config = getDefaultConfig({
  appName: "TrancheFi",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo",
  chains: [unichainSepolia],
  ssr: true,
})
