"use server";

import { act } from "@/server/action";
import { deleteAttachment, setCover } from "@/server/storage";

export async function deleteAttachmentAction(id: string) {
  return act(async ({ ctx }) => {
    await deleteAttachment(ctx, id);
    return null;
  });
}

export async function setCoverAction(id: string) {
  return act(async ({ ctx }) => {
    await setCover(ctx, id);
    return null;
  });
}
