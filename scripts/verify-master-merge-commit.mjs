#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const eventName = process.env.GITHUB_EVENT_NAME ?? "";
const ref = process.env.GITHUB_REF ?? "";
const sha = process.env.GITHUB_SHA ?? "HEAD";
const protectedRefs = new Set(["refs/heads/master", "refs/heads/main"]);

if (eventName !== "push" || !protectedRefs.has(ref)) {
  process.exit(0);
}

const parentsLine = execFileSync("git", ["rev-list", "--parents", "-n", "1", sha], {
  encoding: "utf8",
}).trim();
const parentCount = Math.max(0, parentsLine.split(/\s+/).length - 1);

if (parentCount < 2) {
  console.error(
    `Direct push guard failed: ${sha} has ${parentCount} parent(s). Push to ${ref} must be a PR merge commit.`,
  );
  process.exit(1);
}
