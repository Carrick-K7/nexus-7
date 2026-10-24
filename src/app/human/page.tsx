import type { Metadata } from "next";
import HumanHome from "@/components/human/HumanHome";

export const metadata: Metadata = {
  title: "Nexus · 给人看的",
  description: "用一个真实的小实验，看懂 Nexus 是什么、现在是否在工作、试错结果与花费。",
};

export default function HumanPage() {
  return <HumanHome />;
}
