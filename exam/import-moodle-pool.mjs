#!/usr/bin/env node
/**
 * The one-time import of the Moodle question pool (design.md, D10), by hand:
 *
 *   node exam/import-moodle-pool.mjs <german.xml> <english.xml> [--db <path>] [--dry-run]
 *
 * Inside the module's directory rather than `tools/`, so it ships in the image
 * and runs where the database is: in the container on babylon5, with
 * `docker exec`, after the module is switched on there. Without `--db` it uses
 * the module's own database path (`data/exam.sqlite`, or `EXAM_DB_PATH`).
 *
 * `--dry-run` reads and verifies both files and prints the report without
 * opening any database. The report holds counts only.
 */

import fs from "node:fs";
import path from "node:path";

import { databasePath, openDatabase } from "./db.js";
import { importPool, planImport, PoolImportError } from "./pool-import.js";

function usage() {
  console.error("Usage: node exam/import-moodle-pool.mjs <german.xml> <english.xml> [--db <path>] [--dry-run]");
  process.exit(2);
}

let dryRun = false;
let dbPath = databasePath();
const files = [];
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--dry-run") dryRun = true;
  else if (args[index] === "--db") dbPath = args[++index] ?? usage();
  else files.push(args[index]);
}
const [dePath, enPath] = files;
if (files.length !== 2) usage();

try {
  const deXml = fs.readFileSync(dePath, "utf8");
  const enXml = fs.readFileSync(enPath, "utf8");
  let report;
  if (dryRun) {
    report = planImport(deXml, enXml).report;
  } else {
    const { db } = openDatabase(dbPath);
    try {
      report = importPool(db, deXml, enXml, { sources: { de: path.basename(dePath), en: path.basename(enPath) } });
    } finally {
      db.close();
    }
  }
  console.log(`${dryRun ? "Dry run, nothing written" : `Imported into ${dbPath}`}:`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (error instanceof PoolImportError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
