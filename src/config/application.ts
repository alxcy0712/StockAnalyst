export const applicationConfig = {
  backend: {
    protocol: 'http',
    host: 'localhost',
    port: 3001,
  },
} as const;

export function buildBackendUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const { protocol, host, port } = applicationConfig.backend;

  return `${protocol}://${host}:${port}${normalizedPath}`;
}
