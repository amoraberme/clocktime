// Scripts import server modules directly; "server-only" throws outside Next.js, so resolve it to an empty module.
import { registerHooks } from "node:module";

const stub = new URL("./server-only-empty.cjs", import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: stub, shortCircuit: true };
    return next(specifier, context);
  },
});
