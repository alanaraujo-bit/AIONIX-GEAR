import "server-only";
import { put, get, del } from "@vercel/blob";
import { prisma } from "./db";
import { hasPerm, withTx, type Ctx } from "./context";
import { DomainError, ForbiddenError, NotFoundError, assert } from "./errors";
import { audit, itemEvent } from "./domain/shared";
import { randomBytes } from "node:crypto";

/**
 * Armazenamento de anexos com acesso sempre mediado pelo servidor (nunca URL pública):
 * - "blob": Vercel Blob privado, quando BLOB_READ_WRITE_TOKEN está configurado;
 * - "db": bytes no próprio Postgres (padrão; entra automaticamente no backup do banco).
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function driver(): "blob" | "db" {
  return process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "db";
}

const ENTITY_PERMS: Record<string, Parameters<typeof hasPerm>[1][]> = {
  Item: ["inventory.edit", "inventory.adjust"],
  Purchase: ["purchases.manage"],
  Sale: ["sales.manage"],
  Trade: ["trades.manage"],
  Build: ["builds.manage"],
  Contact: ["contacts.manage", "purchases.manage", "trades.manage"],
  Expense: ["finance.manage"],
};

const ENTITY_VIEW: Record<string, Parameters<typeof hasPerm>[1][]> = {
  Item: ["inventory.view"],
  Purchase: ["purchases.manage"],
  Sale: ["sales.manage"],
  Trade: ["trades.manage"],
  Build: ["builds.manage"],
  Contact: ["contacts.manage", "purchases.manage", "trades.manage"],
  Expense: ["finance.view"],
};

async function assertEntity(ctx: Ctx, entityType: string, entityId: string) {
  const where = { id: entityId, orgId: ctx.orgId };
  const found =
    entityType === "Item"
      ? await prisma.item.findFirst({ where, select: { id: true } })
      : entityType === "Purchase"
        ? await prisma.purchase.findFirst({ where, select: { id: true } })
        : entityType === "Sale"
          ? await prisma.sale.findFirst({ where, select: { id: true } })
          : entityType === "Trade"
            ? await prisma.trade.findFirst({ where, select: { id: true } })
            : entityType === "Build"
              ? await prisma.build.findFirst({ where, select: { id: true } })
              : entityType === "Contact"
                ? await prisma.contact.findFirst({ where, select: { id: true } })
                : null;
  if (!found) throw new NotFoundError("Registro");
}

/** Confere a assinatura real do arquivo (não confia na extensão nem no tipo declarado). */
function sniff(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  return null;
}

export async function storeAttachment(
  ctx: Ctx,
  input: { entityType: string; entityId: string; kind: string; fileName: string; bytes: Uint8Array; caption?: string | null },
) {
  const perms = ENTITY_PERMS[input.entityType];
  if (!perms) throw new DomainError("Tipo de anexo inválido.");
  if (!perms.some((p) => hasPerm(ctx, p))) throw new ForbiddenError();
  assert(input.bytes.byteLength > 0, "Arquivo vazio.");
  assert(input.bytes.byteLength <= MAX_UPLOAD_BYTES, "Arquivo grande demais (máximo 4 MB).");
  const type = sniff(input.bytes);
  if (!type || !ALLOWED_TYPES.includes(type)) throw new DomainError("Formato não aceito. Envie JPG, PNG, WEBP ou PDF.");
  await assertEntity(ctx, input.entityType, input.entityId);
  const safeName = input.fileName.replace(/[^\w.\- ]+/g, "_").slice(-120) || "arquivo";
  const kind = type === "application/pdf" ? (input.kind === "RECEIPT" ? "RECEIPT" : "DOCUMENT") : input.kind === "RECEIPT" ? "RECEIPT" : "PHOTO";
  const d = driver();
  let storageKey = "";
  if (d === "blob") {
    const path = `${ctx.orgId}/${input.entityType.toLowerCase()}/${randomBytes(12).toString("hex")}-${safeName}`;
    const res = await put(path, Buffer.from(input.bytes), { access: "private", contentType: type, addRandomSuffix: false });
    storageKey = res.pathname;
  }
  return withTx(async (tx) => {
    const isFirstPhoto =
      kind === "PHOTO" && (await tx.attachment.count({ where: { orgId: ctx.orgId, entityType: input.entityType, entityId: input.entityId, kind: "PHOTO" } })) === 0;
    const att = await tx.attachment.create({
      data: {
        orgId: ctx.orgId,
        entityType: input.entityType,
        entityId: input.entityId,
        kind,
        storage: d,
        storageKey: storageKey || "inline",
        fileName: safeName,
        contentType: type,
        sizeBytes: input.bytes.byteLength,
        isCover: isFirstPhoto,
        caption: input.caption ?? null,
        uploadedById: ctx.userId,
      },
    });
    if (d === "db") await tx.attachmentData.create({ data: { attachmentId: att.id, bytes: Buffer.from(input.bytes) } });
    if (input.entityType === "Item") {
      await itemEvent(tx, ctx, { itemId: input.entityId, type: "PHOTO_ADDED", message: kind === "PHOTO" ? "Foto adicionada" : `Documento anexado: ${safeName}` });
    }
    await audit(tx, ctx, "attachment.add", `Anexo ${safeName} em ${input.entityType}`, { entityType: input.entityType, entityId: input.entityId });
    return { id: att.id, kind };
  });
}

/** Lê o arquivo somente se pertencer à empresa do usuário e ele puder ver a entidade. */
export async function readAttachment(ctx: Ctx, id: string) {
  const att = await prisma.attachment.findFirst({ where: { id, orgId: ctx.orgId }, include: { data: true } });
  if (!att) return null;
  const perms = ENTITY_VIEW[att.entityType] ?? [];
  if (!perms.some((p) => hasPerm(ctx, p))) return null;
  if (att.storage === "db") {
    if (!att.data) return null;
    return { contentType: att.contentType, fileName: att.fileName, body: new Uint8Array(att.data.bytes) as Uint8Array<ArrayBuffer> };
  }
  const res = await get(att.storageKey, { access: "private" });
  if (!res || res.statusCode !== 200) return null;
  return { contentType: att.contentType, fileName: att.fileName, body: res.stream };
}

export async function deleteAttachment(ctx: Ctx, id: string) {
  const att = await prisma.attachment.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!att) throw new NotFoundError("Anexo");
  const perms = ENTITY_PERMS[att.entityType] ?? [];
  if (!perms.some((p) => hasPerm(ctx, p))) throw new ForbiddenError();
  await withTx(async (tx) => {
    await tx.attachment.delete({ where: { id: att.id } });
    if (att.isCover) {
      const next = await tx.attachment.findFirst({ where: { orgId: ctx.orgId, entityType: att.entityType, entityId: att.entityId, kind: "PHOTO" }, orderBy: { createdAt: "asc" } });
      if (next) await tx.attachment.update({ where: { id: next.id }, data: { isCover: true } });
    }
    if (att.entityType === "Item") await itemEvent(tx, ctx, { itemId: att.entityId, type: "PHOTO_REMOVED", message: `Anexo removido: ${att.fileName}` });
    await audit(tx, ctx, "attachment.delete", `Anexo ${att.fileName} removido`, { entityType: att.entityType, entityId: att.entityId });
  });
  if (att.storage === "blob") await del(att.storageKey).catch(() => undefined);
}

export async function setCover(ctx: Ctx, id: string) {
  const att = await prisma.attachment.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!att) throw new NotFoundError("Anexo");
  const perms = ENTITY_PERMS[att.entityType] ?? [];
  if (!perms.some((p) => hasPerm(ctx, p))) throw new ForbiddenError();
  await withTx(async (tx) => {
    await tx.attachment.updateMany({ where: { orgId: ctx.orgId, entityType: att.entityType, entityId: att.entityId }, data: { isCover: false } });
    await tx.attachment.update({ where: { id: att.id }, data: { isCover: true } });
  });
}
