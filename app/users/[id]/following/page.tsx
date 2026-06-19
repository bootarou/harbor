import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { FollowListPage } from "@/components/follow-list-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { displayName: true },
  });
  return { title: user ? `${user.displayName} のフォロー中` : "フォロー中" };
}

export default async function FollowingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FollowListPage userId={id} mode="following" />;
}
