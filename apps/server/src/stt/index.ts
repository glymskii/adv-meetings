import { config } from "../config.js";
import { ElevenLabsStt } from "./elevenlabs.js";
import { FakeStt } from "./fake.js";
import type { SttProvider } from "./provider.js";

let provider: SttProvider | null = null;

export function sttProvider(): SttProvider {
  if (provider) return provider;
  provider = config().FAKE_PROVIDERS ? new FakeStt() : new ElevenLabsStt();
  return provider;
}

export * from "./provider.js";
