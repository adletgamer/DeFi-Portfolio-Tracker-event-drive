import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DOC_FILES = [
  "README.md",
  "SECURITY.md",
  "package.json",
  "frontend/index.html",
];

/** 12-digit AWS account IDs embedded in ARNs or bootstrap URIs. */
const ACCOUNT_ID_IN_ARN = /arn:aws:[a-z0-9-]+:[a-z0-9-]*:\d{12}:/;
const ACCOUNT_ID_IN_BOOTSTRAP = /aws:\/\/\d{12}\//;
const ACCOUNT_ID_IN_SQS_URL = /sqs\.[a-z0-9-]+\.amazonaws\.com\/\d{12}\//;

describe("documentation must not embed AWS account IDs", () => {
  for (const relative of DOC_FILES) {
    it(`${relative} has no 12-digit account IDs in ARNs or bootstrap URIs`, () => {
      const text = readFileSync(resolve(ROOT, relative), "utf8");
      expect(text).not.toMatch(ACCOUNT_ID_IN_ARN);
      expect(text).not.toMatch(ACCOUNT_ID_IN_BOOTSTRAP);
      expect(text).not.toMatch(ACCOUNT_ID_IN_SQS_URL);
    });
  }

  it("ships the walkthrough video in frontend/demo/", () => {
    const video = resolve(ROOT, "frontend/demo/walkthrough.mp4");
    const info = statSync(video);
    expect(info.size).toBeGreaterThan(100_000);
  });
});
