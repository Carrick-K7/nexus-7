import type { Metadata } from "next";
import HumanHome from "@/components/human/HumanHome";
import ResearchShell from "@/components/research/ResearchShell";

type HomeProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: HomeProps): Promise<Metadata> {
  return (await searchParams)?.view !== undefined ? {} : {
    title: "NEXUS-7 · 研究概览",
    description: "NEXUS-7 研究状态、实验结果与运行记录。",
  };
}

export default async function Home({ searchParams }: HomeProps) {
  const query = await searchParams;
  // Explicit legacy view links keep their original shell and interpretation.
  return query?.view !== undefined ? <ResearchShell /> : <HumanHome />;
}
