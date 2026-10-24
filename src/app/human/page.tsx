import type { Metadata } from "next";
import HumanHome from "@/components/human/HumanHome";

export const metadata: Metadata = {
  title: "NEXUS-7 · 研究概览",
  description: "NEXUS-7 研究状态、实验结果与运行记录。",
};

export default function HumanPage() {
  return <HumanHome />;
}
