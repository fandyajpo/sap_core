import { registerHooks } from "node:module";

// Next's server-only marker resolves to an empty module under the
// react-server export condition. This test-only hook mirrors that behavior
// for direct Node execution without adding a production dependency or
// weakening the marker in application code.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        url: "data:text/javascript,export%20%7B%7D",
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});
