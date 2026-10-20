import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

/** Serializa el cambio de transporte, incluso entre dos procesos del CRM. */
export async function withWhatsappConnectionLock<T>(
  organizationId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`whatsapp:${organizationId}`}))`,
    );
    return operation();
  });
}
