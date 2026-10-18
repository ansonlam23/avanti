import { beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/gemini", () => ({
  getGemini: () => ({ models: { generateContent } }),
  geminiModel: () => "primary",
}));
vi.mock("@/lib/env", () => ({ env: { geminiFallbackModels: () => ["backup-a", "backup-b"] } }));

const { extractMenu, OnboardAiError } = await import("@/lib/ai/onboard");

const DRAFT = {
  heard: "Lemon bars are four seventy five",
  shop_name: null,
  language: "en",
  items: [
    {
      name: "Lemon bars",
      name_en: null,
      price_evidence: "four seventy five",
      price_source: "spoken",
      price_cents: 475,
      est_quantity: null,
      description: null,
      tags: [],
      box_2d: null,
    },
  ],
  unclear: [],
};
const input = {
  image: { data: Buffer.from("img"), mimeType: "image/jpeg" },
  audio: { data: Buffer.from("aud"), mimeType: "audio/m4a" },
};
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
const modelsCalled = () => generateContent.mock.calls.map((c) => (c[0] as { model: string }).model);

describe("onboarding model fallback", () => {
  beforeEach(() => generateContent.mockReset());

  it("gives the next model a go when one reads a full counter as empty", async () => {
    const EMPTY = { ...DRAFT, items: [] };
    generateContent
      .mockResolvedValueOnce({ text: JSON.stringify(EMPTY) })
      .mockResolvedValueOnce({ text: JSON.stringify(DRAFT) });
    const draft = await extractMenu(input);
    expect(modelsCalled()).toEqual(["primary", "backup-a"]);
    expect(draft.items).toHaveLength(1);
  });

  it("keeps an empty read when every later model is out of quota", async () => {
    const EMPTY = { ...DRAFT, items: [] };
    generateContent
      .mockResolvedValueOnce({ text: JSON.stringify(EMPTY) })
      .mockRejectedValueOnce(httpError(429))
      .mockRejectedValueOnce(httpError(429));
    const draft = await extractMenu(input);
    expect(modelsCalled()).toEqual(["primary", "backup-a", "backup-b"]);
    expect(draft.items).toEqual([]);
  });

  it("moves to the next model when one is out of free quota", async () => {
    generateContent.mockRejectedValueOnce(httpError(429)).mockResolvedValueOnce({ text: JSON.stringify(DRAFT) });
    const draft = await extractMenu(input);
    expect(modelsCalled()).toEqual(["primary", "backup-a"]);
    expect(draft.items[0]?.price_cents).toBe(475);
  });

  it("fails with a retryable error when every model is out of quota", async () => {
    generateContent
      .mockRejectedValueOnce(httpError(429))
      .mockRejectedValueOnce(httpError(429))
      .mockRejectedValueOnce(httpError(429));
    await expect(extractMenu(input)).rejects.toMatchObject({ retryable: true });
    expect(modelsCalled()).toEqual(["primary", "backup-a", "backup-b"]);
  });

  it("does not fall back on a rejected request (400)", async () => {
    generateContent.mockRejectedValueOnce(httpError(400));
    const err = await extractMenu(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OnboardAiError);
    expect((err as InstanceType<typeof OnboardAiError>).retryable).toBe(false);
    expect(modelsCalled()).toEqual(["primary"]);
  });

  it("retries a server error once on the same model before failing", async () => {
    generateContent.mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce({ text: JSON.stringify(DRAFT) });
    await extractMenu(input);
    expect(modelsCalled()).toEqual(["primary", "primary"]);
  });
});
