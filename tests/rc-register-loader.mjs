import { register } from 'node:module';

register(new URL('./rc-extension-resolver.mjs', import.meta.url));
