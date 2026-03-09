import { getDefaultConfig } from "@rainbow-me/rainbowkit"
import { unichainSepolia } from "./chains"

export const config = getDefaultConfig({
  appName: "TrancheFi",
  projectId: "73a2755060b5fb20aa3cfb912c07a48f",
  chains: [unichainSepolia],
  ssr: true,
})
