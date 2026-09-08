import { test, expect } from "@playwright/test";
import { DEFAULT_PROJECT } from "../src/lib/story";
const base = process.env.PREVIEW_URL || "http://127.0.0.1:3000";

test("invalid inputs are rejected and a render can be cancelled", async ({ request }) => {
  const invalid = await request.post(`${base}/api/projects`, { data: { name: "Missing content" } });
  expect(invalid.status()).toBe(400);
  const traversal = await request.post(`${base}/api/projects`, { data: { ...DEFAULT_PROJECT, images: ["/../../etc/passwd"] } });
  expect(traversal.status()).toBe(400);
  const result = await request.post(`${base}/api/render`, { data: DEFAULT_PROJECT });
  expect(result.status()).toBe(202);
  const job = await result.json();
  const cancel = await request.delete(`${base}/api/render/${job.id}`);
  expect(cancel.ok()).toBeTruthy();
  await new Promise(resolve => setTimeout(resolve, 1000));
  await expect.poll(async () => (await (await request.get(`${base}/api/render/${job.id}`)).json()).status).toBe("cancelled");
  const unavailable = await request.get(`${base}/api/render/${job.id}/download`);
  expect(unavailable.status()).toBe(409);
});
