import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Explicit path so the build works from any working directory in the monorepo.
export default { plugins: { tailwindcss: { config: path.join(here, 'tailwind.config.ts') }, autoprefixer: {} } };
