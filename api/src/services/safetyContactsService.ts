import db from "@hakwa/db";
import { safetyContact } from "@hakwa/db/schema";
import { normalizePhoneToE164 } from "@hakwa/core";
import redis from "@hakwa/redis";
import { and, eq } from "drizzle-orm";

const MAX_CONTACTS = 3;

export async function listSafetyContacts(userId: string) {
  return db
    .select({
      id: safetyContact.id,
      name: safetyContact.name,
      phone: safetyContact.phone,
      label: safetyContact.label,
      isActive: safetyContact.isActive,
    })
    .from(safetyContact)
    .where(eq(safetyContact.userId, userId));
}

export async function addSafetyContact(input: {
  userId: string;
  name: string;
  phone: string;
  label?: string;
}) {
  const active = await db
    .select({ id: safetyContact.id })
    .from(safetyContact)
    .where(
      and(
        eq(safetyContact.userId, input.userId),
        eq(safetyContact.isActive, true),
      ),
    );

  if (active.length >= MAX_CONTACTS) {
    throw new Error("SAFETY_CONTACT_LIMIT_REACHED");
  }

  const [created] = await db
    .insert(safetyContact)
    .values({
      userId: input.userId,
      name: input.name,
      phone: normalizePhoneToE164(input.phone),
      label: input.label ?? null,
      isActive: true,
    })
    .returning({
      id: safetyContact.id,
      name: safetyContact.name,
      phone: safetyContact.phone,
      label: safetyContact.label,
      isActive: safetyContact.isActive,
    });

  if (!created) {
    throw new Error("SAFETY_CONTACT_CREATE_FAILED");
  }

  return created;
}

export async function deleteSafetyContact(userId: string, contactId: string) {
  const rows = await db
    .delete(safetyContact)
    .where(
      and(eq(safetyContact.id, contactId), eq(safetyContact.userId, userId)),
    )
    .returning({ id: safetyContact.id });

  if (rows.length === 0) {
    throw new Error("SAFETY_CONTACT_NOT_FOUND");
  }

  return { deleted: true };
}

export async function sendSafetyTestAlert(userId: string) {
  const contacts = await db
    .select({ phone: safetyContact.phone })
    .from(safetyContact)
    .where(
      and(eq(safetyContact.userId, userId), eq(safetyContact.isActive, true)),
    );

  for (const contact of contacts) {
    await redis.xadd(
      "safety:sms:outbox",
      "*",
      "to",
      contact.phone,
      "body",
      "Hakwa test safety alert. No incident has been created.",
      "retryCount",
      "0",
    );
  }

  return { queued: contacts.length };
}
