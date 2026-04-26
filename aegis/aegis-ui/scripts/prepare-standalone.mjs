import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const nextDir = path.join(rootDir, ".next");
const standaloneDir = path.join(nextDir, "standalone");
const standaloneNextDir = path.join(standaloneDir, ".next");

if (!existsSync(standaloneDir)) {
  throw new Error("Standalone output is missing. Run `next build` before preparing standalone assets.");
}

copyIfPresent(path.join(nextDir, "static"), path.join(standaloneNextDir, "static"));
copyIfPresent(path.join(rootDir, "public"), path.join(standaloneDir, "public"));

function copyIfPresent(sourcePath, targetPath) {
  if (!existsSync(sourcePath)) {
    return;
  }

  mkdirSync(path.dirname(targetPath), { recursive: true });
  cpSync(sourcePath, targetPath, { force: true, recursive: true });
  console.log(`Prepared ${path.relative(rootDir, targetPath)}`);
}