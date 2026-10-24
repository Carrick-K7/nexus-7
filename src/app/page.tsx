import type { Metadata } from "next";
import HumanHome from "@/components/human/HumanHome";
import ResearchShell from "@/components/research/ResearchShell";

type HomeProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: HomeProps): Promise<Metadata> {
  return (await searchParams)?.view !== undefined ? {} : {
    title: "Nexus · 给人看的",
    description: "用一个真实的小实验，看懂 Nexus 是什么、现在是否在工作、试错结果与花费。",
  };
}

export default async function Home({ searchParams }: HomeProps) {
  const query = await searchParams;
  // Explicit legacy view links keep their original shell and interpretation.
  return query?.view !== undefined ? <ResearchShell /> : <HumanHome />;
}
