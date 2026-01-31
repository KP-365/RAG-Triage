#!/usr/bin/env node
/**
 * Test script: runs several chat flows (start -> messages -> finish) then fetches
 * completion and hallucination metrics from GET /api/admin/metrics.
 *
 * Prereq: app must be running (npm run dev). Optional: set BASE_URL, ADMIN_NAME, ADMIN_PASSWORD.
 *
 * Usage: node script/test-metrics.mjs   OR   npm run test:metrics
 */

const BASE = process.env.BASE_URL || "http://localhost:5000";
const NUM_CHATS = parseInt(process.env.NUM_CHATS || "5", 10);

// Minimal flow: name -> age -> sex -> complaint, then finish
const FLOW_MESSAGES = ["Jane Doe", "30", "Female", "I have a headache"];

async function fetchJson(method, path, body = null, cookie = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  if (cookie) opts.headers["Cookie"] = cookie;
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function runOneChat(cookie) {
  const start = await fetchJson("POST", "/api/chat/start", null, cookie);
  let sessionId = start.sessionId;
  if (!sessionId) throw new Error("No sessionId from start");

  for (const msg of FLOW_MESSAGES) {
    const out = await fetchJson("POST", "/api/chat/message", { sessionId, message: msg }, cookie);
    sessionId = out.sessionId ?? sessionId;
    if (out.isComplete && out.submissionId) return { completed: true, submissionId: out.submissionId };
  }

  const finish = await fetchJson("POST", "/api/chat/finish", { sessionId }, cookie);
  return { completed: true, submissionId: finish.submissionId };
}

async function main() {
  let cookie = null;
  if (process.env.ADMIN_NAME && process.env.ADMIN_PASSWORD) {
    const res = await fetch(`${BASE}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: process.env.ADMIN_NAME,
        password: process.env.ADMIN_PASSWORD,
      }),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
  }

  console.log(`Running ${NUM_CHATS} chat flow(s), then fetching metrics...\n`);

  let ok = 0;
  let err = 0;
  for (let i = 0; i < NUM_CHATS; i++) {
    try {
      await runOneChat(cookie);
      ok++;
      process.stdout.write(".");
    } catch (e) {
      err++;
      console.warn(`\nChat ${i + 1} failed:`, e.message);
    }
  }
  console.log(`\nCompleted ${ok}/${NUM_CHATS} chats. Errors: ${err}\n`);

  const metrics = await fetchJson("GET", "/api/admin/metrics", null, cookie);

  console.log("--- Metrics ---");
  console.log(JSON.stringify(metrics, null, 2));
  console.log("\n--- Summary ---");
  const c = metrics.chatCompletion || {};
  const h = metrics.hallucinationProxy || {};
  console.log(`Chats completed (total): ${c.completed ?? "—"}`);
  console.log(`Completion rate: ${c.completionRatePercentage ?? "—"}%`);
  console.log(`Sessions with ≥1 extraction divergence (hallucination proxy): ${h.sessionsWithAtLeastOneDivergence ?? "—"}`);
  console.log(`Hallucination rate (proxy): ${h.hallucinationRatePercentage ?? "—"}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
