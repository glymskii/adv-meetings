import { eq, and } from "drizzle-orm";
import { closeDb, db } from "./client.js";
import { agencies, meetingTemplates } from "./schema/index.js";
import { catalog, groupOf } from "../templates/catalog.js";
import { logger } from "../logger.js";

export const AGENCIES: { id: string; name: string }[] = [
  { id: "adv", name: "ADV" },
  { id: "havas", name: "Havas" },
  { id: "um", name: "UM" },
  { id: "mccann", name: "McCann" },
  { id: "seed", name: "SEED" },
  { id: "pixy", name: "Pixy" },
  { id: "mushrooms", name: "Mushrooms" },
  { id: "bidmedia", name: "Bid Media" },
];

export async function seedAgencies() {
  const d = db();
  for (const a of AGENCIES) {
    await d
      .insert(agencies)
      .values({ id: a.id, name: a.name })
      .onConflictDoUpdate({ target: agencies.id, set: { name: a.name } });
  }
  logger.info({ count: AGENCIES.length }, "Агентства засеяны");
}

/** Upsert шаблонов версии 1 из packages/shared/templates.json. Версии > 1 (правки в админке) не трогаем. */
export async function seedTemplates() {
  const d = db();
  let i = 0;
  for (const t of catalog.templates) {
    const group = groupOf(t.group);
    const values = {
      code: t.code,
      version: 1,
      group: t.group,
      category: t.category,
      title: t.title,
      subtitle: t.subtitle,
      goal: t.goal,
      reportTitle: t.reportTitle,
      emoji: t.emojiOverride ?? group.emoji,
      color: t.emojiOverride === "🟢" ? "green" : group.color,
      confidentiality: t.confidentiality,
      allowConfidentialityChoice: t.allowConfidentialityChoice,
      slaHours: t.slaHours,
      sendTo: t.sendTo,
      tone: t.tone,
      commonFields: catalog.commonFields,
      specificFields: t.specificFields,
      reportSections: t.reportSections,
      rules: t.rules,
      tips: t.tips,
      sortOrder: i++,
      isActive: true,
      isDraft: t.isDraft,
    };
    const existing = await d
      .select({ id: meetingTemplates.id })
      .from(meetingTemplates)
      .where(and(eq(meetingTemplates.code, t.code), eq(meetingTemplates.version, 1)))
      .limit(1);
    if (existing[0]) {
      await d.update(meetingTemplates).set(values).where(eq(meetingTemplates.id, existing[0].id));
    } else {
      await d.insert(meetingTemplates).values(values);
    }
  }
  logger.info({ count: catalog.templates.length }, "Шаблоны засеяны");
}

async function main() {
  await seedAgencies();
  await seedTemplates();
  await closeDb();
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (isDirectRun) {
  main().catch((e) => {
    logger.error(e, "Ошибка сида");
    process.exit(1);
  });
}
