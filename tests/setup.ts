import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Testing Library's automatic `afterEach(cleanup)` only self-registers when
// it detects a global `afterEach` (e.g. via Vitest's `test.globals: true`).
// `vitest.config.mts` doesn't enable `globals`, so register cleanup here
// once for every test file instead of duplicating it locally.
afterEach(cleanup);
