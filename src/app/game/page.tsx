import type { Metadata } from "next";
import CashFlowGame from "@/components/cashflow-game/cash-flow-game";

export const metadata: Metadata = {
  title: "Free Cash Flow: the 3D runner",
  description: "Collect cash, dodge OpEx, invest in CapEx and maximize free cash flow over six quarters."
};

export default function GamePage() {
  return <CashFlowGame />;
}
