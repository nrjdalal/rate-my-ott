// The build-time env WXT inlines from the repo-root .env (see wxt.config.ts), typed here so import.meta.env is not `any` at the one place it is read, utils/env.ts.
interface ImportMetaEnv {
  readonly WXT_PUBLIC_API_URL: string
}
