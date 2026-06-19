"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { profileSchema } from "@/lib/validations";

export type ProfileFormState = {
  error?: string;
  success?: boolean;
};

// プロフィール更新（要ログイン、本人のみ）。
// 画像本体はクライアントが先に /api/upload へ送り、ここには avatarUrl 文字列のみ渡る。
export async function updateProfile(
  _prevState: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "認証が必要です。再度ログインしてください。" };
  }

  const str = (key: string): string => {
    const v = formData.get(key);
    return typeof v === "string" ? v : "";
  };
  const parsed = profileSchema.safeParse({
    displayName: str("displayName"),
    bio: str("bio"),
    xAccount: str("xAccount"),
    avatarUrl: str("avatarUrl"),
    coverImage: str("coverImage"),
    email: str("email"),
    emailNotificationsEnabled: formData.get("emailNotificationsEnabled") === "true",
    websiteUrl: str("websiteUrl"),
    tokushoho: str("tokushoho"),
    salesTerms: str("salesTerms"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "入力内容を確認してください",
    };
  }

  const {
    displayName,
    bio,
    xAccount,
    avatarUrl,
    coverImage,
    email,
    emailNotificationsEnabled,
    websiteUrl,
    tokushoho,
    salesTerms,
  } = parsed.data;

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        displayName,
        bio: bio ? bio : null,
        xAccount: xAccount ? xAccount : null,
        avatarUrl: avatarUrl ? avatarUrl : null,
        coverImage: coverImage ? coverImage : null,
        email: email ? email : null,
        emailNotificationsEnabled: email ? emailNotificationsEnabled : false,
        websiteUrl: websiteUrl ? websiteUrl : null,
        tokushoho: tokushoho ? tokushoho : null,
        salesTerms: salesTerms ? salesTerms : null,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "このメールアドレスは既に使用されています" };
    }
    console.error("updateProfile error", error);
    return { error: "プロフィールの更新に失敗しました" };
  }

  revalidatePath("/profile");
  revalidatePath("/");
  return { success: true };
}
