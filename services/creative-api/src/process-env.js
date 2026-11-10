export function cleanProcessEnv(extra = {}) {
  return {
    PATH: process.env.PATH || '/usr/bin:/bin',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    ...extra,
  };
}
