import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const input = process.argv[2] || "data-import/Tour Programs Data Sheet.xlsx";

const output = path.resolve("src/lib/wizard/program-master-import.generated.ts");
const workbook = XLSX.readFile(path.resolve(input), { cellDates: false });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
const parseDuration = (value) => {
  const text = clean(value);
  const nights = Number(text.match(/(\d+)\s*night/i)?.[1] || 0);
  const days = Number(text.match(/(\d+)\s*day/i)?.[1] || nights + 1);
  return { nights, days };
};

const aliases = [
  ["Indore", /\b(?:Idr|Indore)\b/i],
  ["Ujjain", /\b(?:Ujj|Ujjain)\b/i],
  ["Omkareshwar", /\b(?:Omk|Omkareshwar)\b/i],
  ["Maheshwar", /\b(?:Mah|Maheshwar)\b/i],
  ["Mandu", /\b(?:Man|Mandu|Mandav)\b/i],
  ["Bhopal", /\b(?:Bhp|Bho|Bhopal)\b/i],
  ["Sanchi", /\b(?:San|Sanchi)\b/i],
  ["Bhimbetka", /\b(?:Bhim|Bhimbetka)\b/i],
  ["Bhojpur", /\b(?:Bhoj|Bhojpur)\b/i],
  ["Jabalpur", /\b(?:Jbp|Jab|Jabalpur)\b/i],
  ["Khajuraho", /\b(?:Hjr|Khajuraho)\b/i],
  ["Orchha", /\b(?:Orc|Och|Orchha)\b/i],
  ["Gwalior", /\b(?:Gwl|Gwalior)\b/i],
  ["Datia", /\b(?:Dat|Datia)\b/i],
  ["Morena", /\b(?:Mor|Morena)\b/i],
  ["Pachmarhi", /\b(?:Pch|Pach|Pachmarhi)\b/i],
  ["Kanha", /\b(?:Kan|Kanha)\b/i],
  ["Bandhavgarh", /\b(?:Ban|Bandhavgarh)\b/i],
  ["Pench", /\b(?:Pen|Pench)\b/i],
  ["Panna", /\b(?:Pan|Panna)\b/i],
  ["Madai", /\b(?:Mad|Madai)\b/i],
  ["Tawa", /\bTawa\b/i],
  ["Amarkantak", /\b(?:Amk|Amarkantak)\b/i],
  ["Chitrakoot", /\b(?:Ckt|Chitrakoot)\b/i],
  ["Shivpuri", /\b(?:Shp|Shivpuri)\b/i],
  ["Burhanpur", /\b(?:Bur|Burhanpur)\b/i],
];

const routingFromSummary = (summary, nights, days) => {
  const [prefix, ...bodyParts] = summary.split("|");
  const body = bodyParts.length ? bodyParts.join("|") : summary;
  const findCities = (text) =>
    aliases
      .flatMap(([city, matcher]) => {
        const pattern = new RegExp(matcher.source, "gi");
        return Array.from(text.matchAll(pattern), (match) => ({
          city,
          index: match.index ?? 0,
          end: (match.index ?? 0) + match[0].length,
        }));
      })
      .sort((left, right) => left.index - right.index);
  const bodyCities = findCities(body).filter(
    (entry, index, values) => index === 0 || entry.city !== values[index - 1].city,
  );
  if (!bodyCities.length) return [];

  const stays = bodyCities.map((entry, index) => {
    const start = index === 0 ? 0 : bodyCities[index - 1].end;
    const end = bodyCities[index + 1]?.index ?? body.length;
    const segment = body.slice(start, end);
    return { city: entry.city, nights: Number(segment.match(/(\d+)\s*N\b/i)?.[1] || 1) };
  });
  const nightCities = stays.flatMap(({ city, nights: stayNights }) =>
    Array.from({ length: stayNights }, () => city),
  );
  const routeNights = Array.from({ length: Math.max(0, nights) }, (_, index) =>
    nightCities[index] || nightCities[nightCities.length - 1] || bodyCities[bodyCities.length - 1].city,
  );
  const finalCity = routeNights[routeNights.length - 1] || bodyCities[bodyCities.length - 1].city;
  const departure = findCities(prefix).at(-1)?.city || bodyCities[0].city;

  return Array.from({ length: Math.max(1, days) }, (_, index) => {
    const destination = routeNights[index] || finalCity;
    return {
      day: index + 1,
      from_city: index === 0 ? departure : routeNights[index - 1] || finalCity,
      destination_city: destination,
      overnight_city: index < nights ? destination : null,
      program_text: summary,
    };
  });
};

const records = rows.slice(1).flatMap((row) => {
  const code = clean(row[1]);
  if (!code) return [];
  const durationLabel = clean(row[2]);
  const suppliedName = clean(row[3]);
  const routingSummary = clean(row[4]);
  const { nights, days } = parseDuration(durationLabel);
  const haystack = `${suppliedName} ${routingSummary}`;
  const cities = aliases.filter(([, matcher]) => matcher.test(haystack)).map(([city]) => city);
  return [
    {
      id: code,
      code,
      name: suppliedName || `Unnamed Program — ${code}`,
      name_missing: !suppliedName,
      nights,
      days,
      duration_label: durationLabel || `${nights} Nights & ${days} Days`,
      routing_summary: routingSummary,
      routing: routingFromSummary(routingSummary, nights, days),
      cities,
      source: "Excel Import",
      status: suppliedName ? "Active" : "Draft",
    },
  ];
});

const datasetId = `program-master-${new Date().toISOString().slice(0, 10)}-${records.length}`;
const source =
  `// Generated from the approved offline Tour Programs workbook.\n` +
  `// Rebuild with: npm run data:import:programs -- <workbook.xlsx>\n` +
  `export const PROGRAM_MASTER_DATASET_ID = ${JSON.stringify(datasetId)};\n\n` +
  `export const IMPORTED_PROGRAMS = ${JSON.stringify(records, null, 2)} as const;\n`;

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, source);
console.log(`Generated ${records.length} programs at ${output}`);
