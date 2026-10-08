// Build-time check of tool metadata.
process.env.VERCEL = "1";
const { TOOLS } = await import("../app.js");
const errs = [];
for (const t of TOOLS) {
  if (!/^[a-z0-9_]{3,48}$/.test(t.name)) errs.push(`${t.name}: bad name`);
  if (!t.description || t.description.length > 500) errs.push(`${t.name}: description length ${t.description?.length}`);
  if (!(t.tags?.length >= 1 && t.tags.length <= 5 && t.tags.every((x) => /^[\x20-\x7E]{1,32}$/.test(x)))) errs.push(`${t.name}: tags`);
}
if (errs.length) { console.error("✗ " + errs.join("\n✗ ")); process.exit(1); }
console.log(`✓ ${TOOLS.length} paid tools valid`);
