"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "../context";
import { prisma } from "../db";

export async function switchCompanyAction(companyId: string) {
  const session = await getSession();
  if (!session) return;
  const member = await prisma.employee.findFirst({
    where: { userId: session.user.id, companyId, status: { not: "ARCHIVED" } },
  });
  if (!member) return;
  await prisma.user.update({ where: { id: session.user.id }, data: { activeCompanyId: companyId } });
  revalidatePath("/", "layout");
}
