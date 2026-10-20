
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (context.parentURL) {
      try {
        const req = createRequire(context.parentURL);
        const resolved = req.resolve(specifier);
        return {
          url: pathToFileURL(resolved).href,
          shortCircuit: true
        };
      } catch (e) {}
    }
    throw err;
  }
}
