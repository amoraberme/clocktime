import { vi } from "vitest";

// "server-only" throws outside React Server Components; tests import server modules directly.
vi.mock("server-only", () => ({}));
