import * as esbuild from 'esbuild';

// Plugin to fix ESM/CJS interop for @prisma/client
// Prisma client is CommonJS but we're using ESM, so named exports don't work directly
const prismaInteropPlugin = {
  name: 'prisma-esm-interop',
  setup(build) {
    build.onResolve({ filter: /^@prisma\/client$/ }, (args) => {
      return {
        path: args.path,
        namespace: 'prisma-interop',
      };
    });

    build.onLoad({ filter: /.*/, namespace: 'prisma-interop' }, () => {
      return {
        contents: `
          import { createRequire } from 'module';
          const require = createRequire(import.meta.url);
          const prisma = require('@prisma/client');
          export const PrismaClient = prisma.PrismaClient;
          export const Prisma = prisma.Prisma;
          export const IncidentStatus = prisma.IncidentStatus;
          export const NotificationChannelType = prisma.NotificationChannelType;
          export const InviteStatus = prisma.InviteStatus;
          export const UserStatus = prisma.UserStatus;
          export const MemberRole = prisma.MemberRole;
          export const ClusterEnvironment = prisma.ClusterEnvironment;
          export const ClusterStatus = prisma.ClusterStatus;
          export const HealthStatus = prisma.HealthStatus;
          export const AlertSeverity = prisma.AlertSeverity;
          export const OrganizationPlan = prisma.OrganizationPlan;
          export default prisma;
        `,
        loader: 'js',
      };
    });
  },
};

// Bundle everything into a single file
await esbuild.build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  // Keep node_modules external (they'll be resolved at runtime)
  packages: 'external',
  plugins: [prismaInteropPlugin],
});

console.log('Build completed successfully');
